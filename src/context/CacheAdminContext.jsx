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
    STATIC: 30 * 60 * 1000,   // 30 minutos (categorías, niveles)
    MEDIUM: 5 * 60 * 1000,    // 5 minutos (productos, clientes)
    SHORT: 1 * 60 * 1000,     // 1 minuto (stats, pedidos activos)
    NONE: null                // Nunca expira (datos de sesión)
};

// Tiempo de throttle para invalidaciones por Realtime (ms)
const REALTIME_INVALIDATE_THROTTLE_MS = 2000;

export const CacheAdminContext = createContext();

export const useCacheAdmin = () => useContext(CacheAdminContext);

export const CacheAdminProvider = ({ children }) => {
    // Caché en memoria (estado de React)
    const [cache, setCache] = useState({});

    // Ref para peticiones en vuelo (evitar duplicados)
    const inFlightRequests = useRef(new Map());

    // Ref para cleanup de peticiones en vuelo huérfanas
    const cleanupIntervalRef = useRef(null);

    // Hook para detectar el cierre de sesión
    const { admin } = useAdminAuth();

    // Ref para throttled invalidate (se crea una sola vez)
    const throttledInvalidateRef = useRef(null);

    // 1. Hidratación inicial desde sessionStorage
    useEffect(() => {
        let isMounted = true;

        const hydrate = async () => {
            console.log('[CacheAdmin] Hidratando caché desde IndexedDB...');
            try {
                const entries = await getAllStorageItems();
                if (!isMounted) return;

                const hydratedCache = {};
                for (const [key, entry] of Object.entries(entries)) {
                    // Validación robusta de la estructura del entry
                    if (entry && typeof entry === 'object' && 'timestamp' in entry && 'data' in entry) {
                        if (!isExpired(entry.timestamp, entry.ttl)) {
                            hydratedCache[key] = entry;
                        } else {
                            removeStorageItem(key); // Limpiar expirados (fire and forget)
                        }
                    } else {
                        removeStorageItem(key); // Limpiar corruptos
                    }
                }
                setCache(hydratedCache);
                console.log(`[CacheAdmin] Hidratación completa. ${Object.keys(hydratedCache).length} entradas cargadas.`);
            } catch (error) {
                console.error('[CacheAdmin] Error durante la hidratación:', error);
            }
        };

        hydrate();

        // 2. Iniciar limpieza periódica
        const intervalId = setInterval(() => {
            setCache(prevCache => cleanupExpiredEntries(prevCache));
        }, 60 * 1000); // Limpiar cada 60 segundos

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, []);

    // Cleanup interval para peticiones en vuelo huérfanas
    useEffect(() => {
        cleanupIntervalRef.current = setInterval(() => {
            const now = Date.now();
            const ORPHAN_THRESHOLD_MS = 30000; // 30 segundos
            let orphanedCount = 0;

            inFlightRequests.current.forEach((request, key) => {
                const elapsed = now - request.startTime;

                // Si la petición lleva más de 30 segundos, probablemente está huérfana
                if (elapsed > ORPHAN_THRESHOLD_MS && request.status === 'pending') {
                    console.warn(`[CacheAdmin] Petición huérfana detectada para "${key}" (${elapsed}ms). Limpiando...`);
                    inFlightRequests.current.delete(key);
                    orphanedCount++;
                }
            });

            if (orphanedCount > 0) {
                console.log(`[CacheAdmin] Limpiadas ${orphanedCount} peticiones huérfanas.`);
            }

            // Log de estado
            const activeCount = inFlightRequests.current.size;
            if (activeCount > 0) {
                console.debug(`[CacheAdmin] ${activeCount} peticiones en vuelo activas`);
            }
        }, 10000); // Chequear cada 10 segundos

        return () => {
            if (cleanupIntervalRef.current) {
                clearInterval(cleanupIntervalRef.current);
            }
        };
    }, []);

    // 3. Limpieza de caché al cerrar sesión
    useEffect(() => {
        // Si el admin se vuelve null (cierre de sesión)
        if (!admin) {
            console.log('[CacheAdmin] Cierre de sesión detectado. Limpiando caché...');
            setCache({});
            inFlightRequests.current.clear();
            clearStorage();

            // Cancelar throttle si existe
            if (throttledInvalidateRef.current?.cancel) {
                throttledInvalidateRef.current.cancel();
            }
        }
    }, [admin]);

    /**
     * Guarda datos en el caché (memoria y sessionStorage).
     */
    const setCached = useCallback((key, data, ttl = DEFAULT_TTL.MEDIUM) => {
        const entry = {
            data,
            timestamp: Date.now(),
            ttl,
            key
        };

        // Actualizar estado en memoria
        setCache(prevCache => ({
            ...prevCache,
            [key]: entry
        }));

        // Actualizar IndexedDB (asíncrono, ya no serializamos y no bloquea UI)
        setStorageItem(key, entry);
    }, []);

    /**
     * Recupera datos del caché.
     */
    const getCached = useCallback((key, options = {}) => {
        const { skipExpiry = false } = options;
        const entry = cache[key];

        if (!entry) return null; // No encontrado

        if (!skipExpiry && isExpired(entry.timestamp, entry.ttl)) {
            // Expirado
            return null;
        }

        // Encontrado y válido
        return {
            data: entry.data,
            isExpired: isExpired(entry.timestamp, entry.ttl), // Para stale-while-revalidate
            age: Date.now() - entry.timestamp
        };
    }, [cache]);

    /**
     * Invalida (borra) una o más entradas del caché.
     * Versión throttled para usar con Realtime (evita refetch masivos).
     */
    const invalidate = useCallback((keyOrPattern, options = {}) => {
        const { throttled = false } = options;

        // Si es throttled, usar la función con throttle
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
                // Para patrones o '*', ejecutar inmediatamente
                throttledInvalidateRef.current.flush();
                // Ejecutar la invalidación original
            }
            return;
        }

        setCache(prevCache => {
            const nextCache = { ...prevCache };
            let invalidatedCount = 0;

            if (keyOrPattern === '*') {
                // Limpiar todo
                invalidatedCount = Object.keys(nextCache).length;
                clearStorage();
                return {};
            }

            if (typeof keyOrPattern === 'string') {
                // Invalidación por clave exacta
                if (nextCache[keyOrPattern]) {
                    delete nextCache[keyOrPattern];
                    removeStorageItem(keyOrPattern);
                    invalidatedCount = 1;
                }
            } else if (keyOrPattern instanceof RegExp) {
                // Invalidación por patrón RegExp
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

    /**
     * Función auxiliar para manejar peticiones (con deduplicación).
     * Incluye timestamp para detectar peticiones huérfanas.
     */
    const handleFetch = useCallback(async (key, fetcher, ttl) => {
        // 1. DEDUPLICACIÓN: Verificar si ya hay una petición en curso
        const existingRequest = inFlightRequests.current.get(key);
        if (existingRequest) {
            console.log(`[CacheAdmin] Petición duplicada para "${key}". Esperando resultado...`);
            return existingRequest.promise;
        }

        // 2. Crear la promesa de la petición con timestamp
        const startTime = Date.now();
        const fetchPromise = (async () => {
            try {
                console.log(`[CacheAdmin] FETCH: Ejecutando fetcher para "${key}" (t=${startTime}).`);
                const result = await fetcher();

                // Asumimos que el fetcher devuelve { data, error } de Supabase
                if (result.error) {
                    throw new Error(result.error.message);
                }

                const data = result.data;
                setCached(key, data, ttl); // Guardar en caché al tener éxito
                return data;

            } catch (error) {
                console.error(`[CacheAdmin] FETCH ERROR para "${key}":`, error);
                throw error; // Relanzar el error para que useCache lo maneje

            } finally {
                // 4. Limpiar la petición en curso (éxito o fallo)
                const duration = Date.now() - startTime;
                console.log(`[CacheAdmin] FETCH completado para "${key}" en ${duration}ms. Limpiando inFlight.`);
                inFlightRequests.current.delete(key);
            }
        })();

        // 3. Almacenar la promesa en el ref con metadata
        inFlightRequests.current.set(key, {
            promise: fetchPromise,
            startTime,
            status: 'pending'
        });

        return fetchPromise;

    }, [setCached]);

    /**
     * Refresca (invalida y re-fetch) un dato del caché.
     */
    const refresh = useCallback(async (key, fetcher, ttl) => {
        console.log(`[CacheAdmin] REFRESH: Forzando actualización para "${key}".`);
        invalidate(key);
        return handleFetch(key, fetcher, ttl);
    }, [invalidate, handleFetch]);

    /**
     * Precarga datos si no están en caché.
     */
    const preload = useCallback(async (key, fetcher, ttl) => {
        const cached = getCached(key);
        if (!cached) {
            console.log(`[CacheAdmin] PRELOAD: Precargando "${key}".`);
            // No necesitamos el resultado, solo iniciamos el fetch
            handleFetch(key, fetcher, ttl).catch(() => {
                // Capturamos el error para que no cause un Unhandled Promise Rejection
                console.warn(`[CacheAdmin] PRELOAD falló para "${key}".`);
            });
        }
    }, [getCached, handleFetch]);

    /**
     * Invalida con throttle para eventos de Realtime.
     * Evita múltiples refetch en cascada cuando hay muchos cambios simultáneos.
     */
    const invalidateThrottled = useCallback((keyOrPattern) => {
        invalidate(keyOrPattern, { throttled: true });
    }, [invalidate]);

    const value = {
        DEFAULT_TTL,
        getCached,
        setCached,
        invalidate,
        invalidateThrottled,
        refresh,
        preload,
        clear: () => invalidate('*'), // 'clear' es un alias para invalidar todo
        handleFetch,
    };

    return (
        <CacheAdminContext.Provider value={value}>
            {children}
        </CacheAdminContext.Provider>
    );
};
