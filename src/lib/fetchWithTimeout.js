import { NETWORK_TIMEOUT_MS } from './networkState';

const RETRY_DELAYS_MS = [500, 1500, 3000];

export class TimeoutError extends Error {
  constructor(
    message = `TIMEOUT_ERROR: Request timed out after ${NETWORK_TIMEOUT_MS}ms`,
    { timeoutMs = NETWORK_TIMEOUT_MS, cause } = {},
  ) {
    super(message);
    this.name = 'TimeoutError';
    this.code = 'TIMEOUT_ERROR';
    this.timeoutMs = timeoutMs;

    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

const createAbortError = () => {
  if (typeof DOMException === 'function') {
    return new DOMException('This operation was aborted.', 'AbortError');
  }

  const error = new Error('This operation was aborted.');
  error.name = 'AbortError';
  return error;
};

const isObjectLike = (value) =>
  (typeof value === 'object' || typeof value === 'function') && value !== null;

const isDomExceptionInstance = (value) =>
  typeof DOMException === 'function' && value instanceof DOMException;

const getAbortReason = (reason) => {
  if (isObjectLike(reason)) {
    return reason;
  }

  const abortError = createAbortError();

  if (reason !== undefined) {
    try {
      abortError.cause = reason;
    } catch {
      return abortError;
    }
  }

  return abortError;
};

const getExternalSignal = (input, init = {}) => {
  if (init.signal) {
    return init.signal;
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.signal;
  }

  return undefined;
};

const clampMaxRetries = (maxRetries) => {
  if (!Number.isFinite(maxRetries)) {
    return 0;
  }

  return Math.max(0, Math.min(3, Math.trunc(maxRetries)));
};

const serializeError = (error) => {
  if (!isObjectLike(error)) {
    return {
      name: 'Error',
      message: String(error),
      code: '',
    };
  }

  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    message: typeof error.message === 'string' ? error.message : 'Unexpected error',
    code: typeof error.code === 'string' ? error.code : '',
  };
};

const createRequestMeta = (attempt, totalAttempts, finalError = null) => ({
  attempt,
  totalAttempts,
  finalError: finalError ? serializeError(finalError) : null,
});

const attachRequestMeta = (target, requestMeta) => {
  if (!isObjectLike(target)) {
    return target;
  }

  try {
    Object.defineProperty(target, 'requestMeta', {
      value: requestMeta,
      configurable: true,
    });
  } catch {
    return target;
  }

  return target;
};

const isAbortError = (error) => {
  const name = typeof error?.name === 'string' ? error.name : '';
  const message = typeof error?.message === 'string' ? error.message : '';

  return name === 'AbortError' || /aborted/i.test(message);
};

const isTimeoutError = (error) =>
  error instanceof TimeoutError ||
  error?.name === 'TimeoutError' ||
  error?.code === 'TIMEOUT_ERROR';

const isCorsError = (error) => {
  const name = typeof error?.name === 'string' ? error.name : '';
  const message = typeof error?.message === 'string' ? error.message : '';

  return /cors|cross-origin|cross origin|access-control-allow-origin|same origin/i.test(
    `${name} ${message}`,
  );
};

const isNetworkError = (error) => {
  const name = typeof error?.name === 'string' ? error.name : '';
  const message = typeof error?.message === 'string' ? error.message : '';

  return (
    error instanceof TypeError ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|failed to load|network error/i.test(
      `${name} ${message}`,
    )
  );
};

const shouldRetryRequest = (error) => {
  if (!error || isAbortError(error) || isCorsError(error)) {
    return false;
  }

  return isTimeoutError(error) || isNetworkError(error);
};

const waitForRetryDelay = (delayMs, externalSignal) =>
  new Promise((resolve, reject) => {
    if (delayMs <= 0) {
      resolve();
      return;
    }

    if (externalSignal?.aborted) {
      reject(getAbortReason(externalSignal.reason));
      return;
    }

    let timeoutId = null;

    const handleAbort = () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', handleAbort);
      reject(getAbortReason(externalSignal.reason));
    };

    if (externalSignal) {
      externalSignal.addEventListener('abort', handleAbort, { once: true });
    }

    timeoutId = setTimeout(() => {
      externalSignal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
  });

const runFetchAttempt = async (input, init, { timeoutMs, externalSignal }) => {
  if (externalSignal?.aborted) {
    throw getAbortReason(externalSignal.reason);
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timeoutError = null;
  let timeoutId = null;

  const handleExternalAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(getAbortReason(externalSignal.reason));
    }
  };

  if (externalSignal) {
    externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
  }

  timeoutId = setTimeout(() => {
    didTimeout = true;
    timeoutError = new TimeoutError(
      `TIMEOUT_ERROR: Request timed out after ${timeoutMs}ms`,
      { timeoutMs },
    );
    controller.abort(timeoutError);
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout) {
      throw timeoutError;
    }

    if (externalSignal?.aborted) {
      throw getAbortReason(externalSignal.reason);
    }

    const abortReason = controller.signal.reason;
    if (error?.name === 'AbortError' && abortReason && !isDomExceptionInstance(abortReason)) {
      throw abortReason;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);

    if (externalSignal) {
      externalSignal.removeEventListener('abort', handleExternalAbort);
    }
  }
};

const throwWithRequestMeta = (error, requestMeta) => {
  throw attachRequestMeta(error, requestMeta);
};

export async function fetchWithTimeout(input, init = {}, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : NETWORK_TIMEOUT_MS;
  const maxRetries = clampMaxRetries(options.maxRetries);
  const totalAttempts = maxRetries + 1;
  const externalSignal = getExternalSignal(input, init);

  if (externalSignal?.aborted) {
    const abortError = getAbortReason(externalSignal.reason);
    throwWithRequestMeta(abortError, createRequestMeta(1, totalAttempts, abortError));
  }

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const response = await runFetchAttempt(input, init, { timeoutMs, externalSignal });

      return attachRequestMeta(response, createRequestMeta(attempt, totalAttempts, null));
    } catch (error) {
      const hasMoreRetries = attempt < totalAttempts;

      if (!hasMoreRetries || !shouldRetryRequest(error) || externalSignal?.aborted) {
        throwWithRequestMeta(error, createRequestMeta(attempt, totalAttempts, error));
      }

      const retryDelayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

      if (import.meta.env.DEV) {
        console.debug(`Retry ${attempt}/${maxRetries} after ${retryDelayMs}ms`);
      }

      try {
        await waitForRetryDelay(retryDelayMs, externalSignal);
      } catch (delayError) {
        throwWithRequestMeta(delayError, createRequestMeta(attempt, totalAttempts, delayError));
      }
    }
  }

  throw new Error('fetchWithTimeout: unexpected retry flow');
}
