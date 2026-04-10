import { NETWORK_TIMEOUT_MS } from './networkState';

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

const getExternalSignal = (input, init = {}) => {
  if (init.signal) {
    return init.signal;
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.signal;
  }

  return undefined;
};

export async function fetchWithTimeout(input, init = {}, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : NETWORK_TIMEOUT_MS;

  const externalSignal = getExternalSignal(input, init);

  if (externalSignal?.aborted) {
    throw externalSignal.reason ?? createAbortError();
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timeoutError = null;
  let timeoutId = null;

  const handleExternalAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(externalSignal.reason ?? createAbortError());
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
    // 1. Si nosotros provocamos el timeout, lanzamos nuestro error directamente.
    if (didTimeout) {
      throw timeoutError;
    }

    // 2. Si la señal externa abortó la petición, lanzamos su razón.
    if (externalSignal?.aborted) {
      throw externalSignal.reason ?? error;
    }

    // 3. Si hubo un aborto por otra razón, priorizamos la razón del signal.
    const abortReason = controller.signal.reason;
    if (error.name === 'AbortError' && abortReason && !(abortReason instanceof DOMException)) {
      throw abortReason;
    }

    // 4. Si es cualquier otro error de red (CORS, offline), lo lanzamos intacto.
    throw error;
  } finally {
    clearTimeout(timeoutId);

    if (externalSignal) {
      externalSignal.removeEventListener('abort', handleExternalAbort);
    }
  }
}
