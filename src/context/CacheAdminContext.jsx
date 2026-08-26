/* src/context/CacheAdminContext.jsx */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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

// TTLs por defecto (en milisegundos)
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
    const cleanupIntervalRef = useRef(null);
    const { admin } = useAdminAuth();
    const throttledInvalidateRef = useRef(null);

    // Hydrate first. Consumers must wait for this flag before fetching so a
    // late hydration cannot overwrite a freshly fetched cache entry.
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
                if (isMounted) {
                    // Do not leave consumers blocked forever after a storage error.
                    setIsHydrated(true);
                }
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

    useEffect(() => {
        cleanupIntervalRef.current = setInterval(() => {
            const now = Date.now();
            const ORPHAN_THRESHOLD_MS = 30000;
            let orphanedCount = 0;

            inFlightRequests.current.forEach((request, key) => {
                const elapsed = now - request.startTime;
                if (elapsed > ORPHAN_THRESHOLD_MS && request.status === 'pending') {
                    console.warn(`[CacheAdmin] Petición huérfana detectada para "${key}" (${elapsed}ms). Limpiando...`);
                    inFlightRequests.current.delete(key);
                    orphanedCount++;
                }
            });

            if (orphanedCount > 0) {
                console.log(`[CacheAdmin] Limpiadas ${orphanedCount} peticiones huérfanas.`);
            }
        }, 10000);

        return () => {
            if (cleanupIntervalRef.current) {
                clearInterval(cleanupIntervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!admin) {
            console.log('[CacheAdmin] Cierre de sesión detectado. Limpiando caché...');
            setCache({});
            inFlightRequests.current.clear();
            clearStorage();

            if (throttledInvalidateRef.current?.cancel) {
                throttledInvalidateRef.current.cancel();
            }
        }
    }, [admin]);

    const setCached = useCallback((key, data, ttl = DEFAULT_TTL.MEDIUM) => {
        const entry = {
            data,
            timestamp: Date.now(),
            ttl,
            key
        };

        setCache(prevCache => ({
            ...prevCache,
            [key]: entry
        }));

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
                    (key) => invalidate(key, { throttled: false }),
                    REALTIME_INVALIDATE_THROTTLE_MS,
                    { leading: true, trailing: true }
                );
            }

            if (typeof keyOrPattern === 'string') {
                throttledInvalidateRef.current(keyOrPattern);
            } else {
                throttledInvalidateRef.current.flush();
            }
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
        if (existingRequest) {
            console.log(`[CacheAdmin] Petición duplicada para "${key}". Esperando resultado...`);
            return existingRequest.promise;
        }

        const startTime = Date.now();
        const fetchPromise = (async () => {
            try {
                console.log(`[CacheAdmin] FETCH: Ejecutando fetcher para "${key}" (t=${startTime}).`);
                const result = await fetcher();
                if (result.error) throw new Error(result.error.message);

                const data = result.data;
                setCached(key, data, ttl);
                return data;
            } catch (error) {
                console.error(`[CacheAdmin] FETCH ERROR para "${key}":`, error);
                throw error;
            } finally {
                const duration = Date.now() - startTime;
                console.log(`[CacheAdmin] FETCH completado para "${key}" en ${duration}ms. Limpiando inFlight.`);
                inFlightRequests.current.delete(key);
            }
        })();

        inFlightRequests.current.set(key, {
            promise: fetchPromise,
            startTime,
            status: 'pending'
        });

        return fetchPromise;
    }, [setCached]);

    const refresh = useCallback(async (key, fetcher, ttl) => {
        console.log(`[CacheAdmin] REFRESH: Forzando actualización para "${key}".`);
        invalidate(key);
        return handleFetch(key, fetcher, ttl);
    }, [invalidate, handleFetch]);

    const preload = useCallback(async (key, fetcher, ttl) => {
        const cached = getCached(key);
        if (!cached) {
            console.log(`[CacheAdmin] PRELOAD: Precargando "${key}".`);
            handleFetch(key, fetcher, ttl).catch(() => {
                console.warn(`[CacheAdmin] PRELOAD falló para "${key}".`);
            });
        }
    }, [getCached, handleFetch]);

    const invalidateThrottled = useCallback((keyOrPattern) => {
        invalidate(keyOrPattern, { throttled: true });
    }, [invalidate]);

    const value = {
        DEFAULT_TTL,
        isHydrated,
        getCached,
        setCached,
        invalidate,
        invalidateThrottled,
        refresh,
        preload,
        clear: () => invalidate('*'),
        handleFetch,
    };

    return (
        <CacheAdminContext.Provider value={value}>
            {children}
        </CacheAdminContext.Provider>
    );
};
