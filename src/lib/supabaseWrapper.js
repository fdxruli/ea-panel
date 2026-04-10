import { TimeoutError } from './fetchWithTimeout';
import { NETWORK_TIMEOUT_MS } from './networkState';

const proxyCache = new WeakMap();
const throwOnErrorBuilders = new WeakSet();
const TIMEOUT_MESSAGE_PATTERN = /TIMEOUT_ERROR|timed out after \d+ms/i;

const isObjectLike = (value) =>
  (typeof value === 'object' || typeof value === 'function') && value !== null;

const isPromiseLike = (value) => typeof value?.then === 'function';

const isPostgrestBuilder = (value) =>
  isObjectLike(value) &&
  typeof value.throwOnError === 'function' &&
  typeof value.then === 'function';

const toTimeoutError = (error) => {
  if (!error) {
    return null;
  }

  if (error instanceof TimeoutError) {
    return error;
  }

  if (error.cause) {
    const nestedTimeout = toTimeoutError(error.cause);
    if (nestedTimeout) {
      return nestedTimeout;
    }
  }

  if (error.originalError) {
    const originalTimeout = toTimeoutError(error.originalError);
    if (originalTimeout) {
      return originalTimeout;
    }
  }

  const name = typeof error.name === 'string' ? error.name : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';

  if (code === 'TIMEOUT_ERROR' || TIMEOUT_MESSAGE_PATTERN.test(name) || TIMEOUT_MESSAGE_PATTERN.test(message)) {
    return new TimeoutError(
      message || `TIMEOUT_ERROR: Request timed out after ${NETWORK_TIMEOUT_MS}ms`,
      { timeoutMs: NETWORK_TIMEOUT_MS, cause: error },
    );
  }

  return null;
};

const toPostgrestErrorResponse = (error) => ({
  error: {
    message: error?.message ?? 'Unexpected Supabase error',
    details: error?.details ?? '',
    hint: error?.hint ?? '',
    code: error?.code ?? '',
  },
  data: null,
  count: null,
  status: Number.isFinite(error?.status) ? error.status : 0,
  statusText: typeof error?.statusText === 'string' ? error.statusText : '',
});

const normalizePromise = (promise, { preservePostgrestErrors = false } = {}) =>
  promise.then(
    (value) => {
      const timeoutError = toTimeoutError(value?.error);
      if (timeoutError) {
        throw timeoutError;
      }

      return value;
    },
    (error) => {
      const timeoutError = toTimeoutError(error);
      if (timeoutError) {
        throw timeoutError;
      }

      if (preservePostgrestErrors) {
        return toPostgrestErrorResponse(error);
      }

      throw error;
    },
  );

const wrapResult = (result) => {
  if (!isObjectLike(result)) {
    return result;
  }

  if (isPostgrestBuilder(result)) {
    return wrapSupabaseClient(result);
  }

  if (isPromiseLike(result)) {
    return normalizePromise(result);
  }

  return wrapSupabaseClient(result);
};

export function wrapSupabaseClient(target) {
  if (!isObjectLike(target)) {
    return target;
  }

  let normalizedTarget = target;

  if (isPostgrestBuilder(target) && !throwOnErrorBuilders.has(target)) {
    normalizedTarget = target.throwOnError();
    throwOnErrorBuilders.add(normalizedTarget);
  }

  if (proxyCache.has(normalizedTarget)) {
    return proxyCache.get(normalizedTarget);
  }

  const proxy = new Proxy(normalizedTarget, {
    get(currentTarget, prop) {
      if (
        isPostgrestBuilder(currentTarget) &&
        (prop === 'then' || prop === 'catch' || prop === 'finally')
      ) {
        const normalizedPromise = normalizePromise(
          Promise.resolve(currentTarget),
          { preservePostgrestErrors: true },
        );

        return normalizedPromise[prop].bind(normalizedPromise);
      }

      const value = Reflect.get(currentTarget, prop, currentTarget);

      if (typeof value === 'function') {
        return (...args) => {
          const result = value.apply(currentTarget, args);
          return wrapResult(result);
        };
      }

      return wrapResult(value);
    },
  });

  proxyCache.set(normalizedTarget, proxy);
  return proxy;
}
