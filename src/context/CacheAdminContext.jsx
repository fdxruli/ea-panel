/* src/context/CacheAdminContext.jsx */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAdminAuth } from './AdminAuthContext';
import {
    isExpired,
    getAllStorageItems,
    setStorageItem,
    removeStorageItem,
    clearStorage,
    cleanupExpiredEntries
} from '../utils/cacheAdminUtils';
import { createThrottle } from '../utils/throttle';

const DEFAULT_TTL = {
    STATIC: 30 * 60 * 1000,
    MEDIUM: 5 * 60 * 1000,
    SHORT: 1 * 60 * 1000,
    NONE: null
};

const REALTIME_INVALIDATE_THROTTLE_MS = 2000;

export const CacheAdminContext = createContext();
export const useCacheAdmin = () => useContext(CacheAdminContext);

export const CacheAdminProvider = ({ children }) => {
    const [cache, setCache] = useState({});
    const [isHydrated, setIsHydrated] = useState(false);
    const inFlightRequests = useRef(new Map());
    const { status } = useAdminAuth();
    const throttledInvalidateRef = useRef(null);

    useEffect(() => {
        let isMounted = true;

        const hydrate = async () => {
            console.log('[CacheAdmin] Hidratando caché desde IndexedDB...');
            try {
                const entries = await getAllStorageItems();
                if (!isMounted) return;

                const hydratedCache = {};
                for (const [key, entry] of Object.entries(entries)) {
                    if (entry && typeof entry === 'object' && 'timestamp' in entry && 'data' in entry) {
                        if (!isExpired(entry.timestamp, entry.ttl)) {
                            hydratedCache[key] = entry;
                        } else {
                            removeStorageItem(key);
                        }
                    } else {
                        removeStorageItem(key);
                    }
                }

                setCache(hydratedCache);
                setIsHydrated(true);
                console.log(`[CacheAdmin] Hidratación completa. ${Object.keys(hydratedCache).length} entradas cargadas.`);
            } catch (error) {
                console.error('[CacheAdmin] Error durante la hidratación:', error);
                if (isMounted) setIsHydrated(true);
            }
        };

        hydrate();

        const intervalId = setInterval(() => {
            setCache(prevCache => cleanupExpiredEntries(prevCache));
        }, 60 * 1000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, []);

    // RESOLVING no significa logout: esperar a que Auth determine el estado.
    useEffect(() => {
        if (status === 'UNAUTHENTICATED' || status === 'CLIENT' || status === 'ERROR') {
            console.log(`[CacheAdmin] Estado de auth ${status}. Limpiando caché...`);
            setCache({});
            inFlightRequests.current.clear();
            clearStorage();

            if (throttledInvalidateRef.current?.cancel) {
                throttledInvalidateRef.current.cancel();
            }
        }
    }, [status]);

    const setCached = useCallback((key, data, ttl = DEFAULT_TTL.MEDIUM) => {
        const entry = { data, timestamp: Date.now(), ttl, key };
        setCache(prevCache => ({ ...prevCache, [key]: entry }));
        setStorageItem(key, entry);
    }, []);

    const getCached = useCallback((key, options = {}) => {
        const { skipExpiry = false } = options;
        const entry = cache[key];
        if (!entry) return null;
        if (!skipExpiry && isExpired(entry.timestamp, entry.ttl)) return null;

        return {
            data: entry.data,
            isExpired: isExpired(entry.timestamp, entry.ttl),
            age: Date.now() - entry.timestamp
        };
    }, [cache]);

    const invalidate = useCallback((keyOrPattern, options = {}) => {
        const { throttled = false } = options;

        if (throttled) {
            if (!throttledInvalidateRef.current) {
                throttledInvalidateRef.current = createThrottle(
                    key => invalidate(key, { throttled: false }),
                    REALTIME_INVALIDATE_THROTTLE_MS,
                    { leading: true, trailing: true }
                );
            }
            if (typeof keyOrPattern === 'string') throttledInvalidateRef.current(keyOrPattern);
            else throttledInvalidateRef.current.flush();
            return;
        }

        setCache(prevCache => {
            const nextCache = { ...prevCache };
            let invalidatedCount = 0;

            if (keyOrPattern === '*') {
                invalidatedCount = Object.keys(nextCache).length;
                clearStorage();
                return {};
            }

            if (typeof keyOrPattern === 'string') {
                if (nextCache[keyOrPattern]) {
                    delete nextCache[keyOrPattern];
                    removeStorageItem(keyOrPattern);
                    invalidatedCount = 1;
                }
            } else if (keyOrPattern instanceof RegExp) {
                for (const key in nextCache) {
                    keyOrPattern.lastIndex = 0;
                    if (keyOrPattern.test(key)) {
                        delete nextCache[key];
                        removeStorageItem(key);
                        invalidatedCount++;
                    }
                }
            }

            console.log(`[CacheAdmin] Invalidadas ${invalidatedCount} entrada(s) para "${keyOrPattern}".`);
            return nextCache;
        });
    }, []);

    const handleFetch = useCallback(async (key, fetcher, ttl) => {
        const existingRequest = inFlightRequests.current.get(key);
        if (existingRequest) return existingRequest.promise;

        const request = { promise: null };
        const fetchPromise = (async () => {
            try {
                const result = await fetcher();
                if (result && result.error) throw new Error(result.error.message || result.error);
                
                // Extraer data tanto si viene encapsulado por Supabase { data, error } como si es el objeto/array directo
                let data = result;
                if (result && typeof result === 'object' && 'data' in result) {
                    if (result.error !== undefined || result.status !== undefined || Object.keys(result).length === 1) {
                        data = result.data;
                    }
                }

                setCached(key, data, ttl);
                return data;
            } finally {
                // Una petición antigua nunca debe borrar una nueva que reutilice la clave.
                if (inFlightRequests.current.get(key) === request) {
                    inFlightRequests.current.delete(key);
                }
            }
        })();

        request.promise = fetchPromise;
        inFlightRequests.current.set(key, request);
        return fetchPromise;
    }, [setCached]);

    const refresh = useCallback((key, fetcher, ttl) => {
        invalidate(key);
        return handleFetch(key, fetcher, ttl);
    }, [invalidate, handleFetch]);

    const preload = useCallback((key, fetcher, ttl) => {
        const cached = getCached(key);
        if (!cached) return handleFetch(key, fetcher, ttl).catch(() => {});
        return undefined;
    }, [getCached, handleFetch]);

    const invalidateThrottled = useCallback((keyOrPattern) => {
        invalidate(keyOrPattern, { throttled: true });
    }, [invalidate]);

    const clear = useCallback(() => invalidate('*'), [invalidate]);
    const contextValue = useMemo(() => ({
        DEFAULT_TTL,
        isHydrated,
        getCached,
        setCached,
        invalidate,
        invalidateThrottled,
        refresh,
        preload,
        clear,
        handleFetch,
    }), [isHydrated, getCached, setCached, invalidate, invalidateThrottled, refresh, preload, clear, handleFetch]);

    return (
        <CacheAdminContext.Provider value={contextValue}>
            {children}
        </CacheAdminContext.Provider>
    );
};
