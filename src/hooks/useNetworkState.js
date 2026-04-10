import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithTimeout, TimeoutError } from '../lib/fetchWithTimeout';
import {
  NETWORK_CONFIRMED_ONLINE_EVENT,
  NETWORK_EVENT_DEBOUNCE_MS,
  NETWORK_POLL_INTERVAL_MS,
  NETWORK_SLOW_THRESHOLD_MS,
  NETWORK_STATUS,
  NETWORK_TIMEOUT_MS,
} from '../lib/networkState';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const healthCheckUrl = supabaseUrl
  ? new URL('/auth/v1/health', supabaseUrl).toString()
  : null;

const initialState = {
  status: NETWORK_STATUS.OFFLINE,
  latencyMs: null,
  isChecking: true,
  hasResolvedOnce: false,
  lastCheckedAt: null,
};

const getRequestMeta = (value) => (
  value && typeof value === 'object' ? value.requestMeta ?? null : null
);

const getAttemptSummary = (requestMeta) => {
  const attempt = Number.isFinite(requestMeta?.attempt) ? requestMeta.attempt : 1;
  const totalAttempts = Number.isFinite(requestMeta?.totalAttempts) ? requestMeta.totalAttempts : 1;

  return `${attempt}/${totalAttempts}`;
};

const isTimeoutRequestError = (error) => (
  error instanceof TimeoutError ||
  error?.name === 'TimeoutError' ||
  error?.code === 'TIMEOUT_ERROR'
);

export default function useNetworkState() {
  const [networkState, setNetworkState] = useState(initialState);
  const resolvedStatusRef = useRef(null);
  const pendingProbeRef = useRef(null);
  const debounceTimeoutRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(false);

  const commitProbeResult = useCallback((nextStatus, latencyMs) => {
    const lastCheckedAt = Date.now();
    const previousStatus = resolvedStatusRef.current;

    resolvedStatusRef.current = nextStatus;

    setNetworkState({
      status: nextStatus,
      latencyMs,
      isChecking: false,
      hasResolvedOnce: true,
      lastCheckedAt,
    });

    if (
      typeof window !== 'undefined' &&
      previousStatus &&
      previousStatus !== NETWORK_STATUS.ONLINE &&
      nextStatus === NETWORK_STATUS.ONLINE
    ) {
      window.dispatchEvent(new CustomEvent(NETWORK_CONFIRMED_ONLINE_EVENT, {
        detail: {
          status: nextStatus,
          latencyMs,
          lastCheckedAt,
        },
      }));
    }
  }, []);

  const commitImmediateOffline = useCallback(() => {
    clearTimeout(debounceTimeoutRef.current);
    abortControllerRef.current?.abort();
    pendingProbeRef.current = null;
    commitProbeResult(NETWORK_STATUS.OFFLINE, null);
  }, [commitProbeResult]);

  const performProbe = useCallback(async ({ allowHidden = false } = {}) => {
    if (
      !allowHidden &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    if (pendingProbeRef.current) {
      return pendingProbeRef.current;
    }

    if (!healthCheckUrl || !supabaseAnonKey) {
      commitProbeResult(NETWORK_STATUS.OFFLINE, null);
      return;
    }

    setNetworkState((prevState) => (
      prevState.isChecking ? prevState : { ...prevState, isChecking: true }
    ));

    const probeController = new AbortController();
    abortControllerRef.current = probeController;

    const probePromise = (async () => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

      try {
        const response = await fetchWithTimeout(
          healthCheckUrl,
          {
            method: 'GET',
            headers: {
              apikey: supabaseAnonKey,
            },
            cache: 'no-store',
            signal: probeController.signal,
          },
          {
            timeoutMs: NETWORK_TIMEOUT_MS,
            maxRetries: 2,
          },
        );
        const requestMeta = getRequestMeta(response);

        if (import.meta.env.DEV) {
          console.debug(
            `[useNetworkState] Health check response after ${getAttemptSummary(requestMeta)} attempts.`,
            {
              ok: response.ok,
              status: response.status,
              requestMeta,
            },
          );
        }

        if (!response.ok) {
          commitProbeResult(NETWORK_STATUS.OFFLINE, null);
          return;
        }

        const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const latencyMs = Math.round(finishedAt - startedAt);
        const nextStatus = latencyMs > NETWORK_SLOW_THRESHOLD_MS
          ? NETWORK_STATUS.SLOW
          : NETWORK_STATUS.ONLINE;

        commitProbeResult(nextStatus, latencyMs);
      } catch (error) {
        const isTimeoutFailure = isTimeoutRequestError(error);

        if (probeController.signal.aborted && !isTimeoutFailure) {
          return;
        }

        const requestMeta = getRequestMeta(error);

        if (import.meta.env.DEV) {
          if (isTimeoutFailure) {
            console.debug(
              `[useNetworkState] Health check timeout exhausted after ${getAttemptSummary(requestMeta)} attempts.`,
              requestMeta,
            );
          } else {
            console.debug(
              `[useNetworkState] Health check failed after ${getAttemptSummary(requestMeta)} attempts.`,
              {
                requestMeta,
                error,
              },
            );
          }
        }

        commitProbeResult(NETWORK_STATUS.OFFLINE, null);
      } finally {
        if (abortControllerRef.current === probeController) {
          abortControllerRef.current = null;
        }

        if (pendingProbeRef.current === probePromise) {
          pendingProbeRef.current = null;
        }

        if (mountedRef.current) {
          setNetworkState((prevState) => (
            prevState.isChecking && !pendingProbeRef.current
              ? { ...prevState, isChecking: false }
              : prevState
          ));
        }
      }
    })();

    pendingProbeRef.current = probePromise;
    return probePromise;
  }, [commitProbeResult]);

  const scheduleDebouncedProbe = useCallback(() => {
    clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(() => {
      void performProbe();
    }, NETWORK_EVENT_DEBOUNCE_MS);
  }, [performProbe]);

  const checkNow = useCallback(() => performProbe({ allowHidden: true }), [performProbe]);

  useEffect(() => {
    mountedRef.current = true;

    void performProbe({ allowHidden: true });

    pollingIntervalRef.current = setInterval(() => {
      void performProbe();
    }, NETWORK_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleDebouncedProbe();
      }
    };

    const handleOnline = () => {
      scheduleDebouncedProbe();
    };

    const handleOffline = () => {
      commitImmediateOffline();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mountedRef.current = false;

      clearTimeout(debounceTimeoutRef.current);
      clearInterval(pollingIntervalRef.current);
      abortControllerRef.current?.abort();

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [commitImmediateOffline, performProbe, scheduleDebouncedProbe]);

  return {
    status: networkState.status,
    latencyMs: networkState.latencyMs,
    isChecking: networkState.isChecking,
    hasResolvedOnce: networkState.hasResolvedOnce,
    lastCheckedAt: networkState.lastCheckedAt,
    checkNow,
  };
}
