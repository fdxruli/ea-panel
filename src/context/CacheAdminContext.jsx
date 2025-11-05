/* src/context/CacheAdminContext.jsx */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAdminAuth } from './AdminAuthContext';
import {
    isExpired,
    serializeForStorage,
    deserializeFromStorage,
    setStorageItem,
    removeStorageItem,
    clearStorage,
    cleanupExpiredEntries
} from '../utils/cacheAdminUtils';

// TTLs por defecto (en milisegundos)
const DEFAULT_TTL = {
    STATIC: 30 * 60 * 1000,   // 30 minutos (categorías, niveles)
    MEDIUM: 5 * 60 * 1000,    // 5 minutos (productos, clientes)
    SHORT: 1 * 60 * 1000,     // 1 minuto (stats, pedidos activos)
    NONE: null                // Nunca expira (datos de sesión)
};

export const CacheAdminContext = createContext();

export const useCacheAdmin = () => useContext(CacheAdminContext);

export const CacheAdminProvider = ({ children }) => {
    // Caché en memoria (estado de React)
    const [cache, setCache] = useState({});
    
    // Ref para peticiones en vuelo (evitar duplicados)
    const inFlightRequests = useRef(new Map());
    
    // Hook para detectar el cierre de sesión
    const { admin } = useAdminAuth();
    
    // 1. Hidratación inicial desde sessionStorage
    useEffect(() => {
        console.log('[CacheAdmin] Hidratando caché desde sessionStorage...');
        const hydratedCache = {};
        const keys = Object.keys(sessionStorage);
        
        for (const fullKey of keys) {
            if (fullKey.startsWith('admin_cache:')) {
                const key = fullKey.replace('admin_cache:', '');
                const entry = deserializeFromStorage(key);
                if (entry && !isExpired(entry.timestamp, entry.ttl)) {
                    hydratedCache[key] = entry;
                } else if (entry) {
                    // Limpiar si está expirado
                    removeStorageItem(key);
                }
            }
        }
        setCache(hydratedCache);
        console.log(`[CacheAdmin] Hidratación completa. ${Object.keys(hydratedCache).length} entradas cargadas.`);

        // 2. Iniciar limpieza periódica
        const intervalId = setInterval(() => {
            setCache(prevCache => cleanupExpiredEntries(prevCache));
        }, 60 * 1000); // Limpiar cada 60 segundos

        return () => clearInterval(intervalId);
    }, []);

    // 3. Limpieza de caché al cerrar sesión
    useEffect(() => {
        // Si el admin se vuelve null (cierre de sesión)
        if (!admin) {
            console.log('[CacheAdmin] Cierre de sesión detectado. Limpiando caché...');
            setCache({});
            inFlightRequests.current.clear();
            clearStorage();
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
        
        // Actualizar sessionStorage (asíncrono, no bloquea)
        setStorageItem(key, serializeForStorage(entry));
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
     */
    const invalidate = useCallback((keyOrPattern) => {
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
     */
    const handleFetch = useCallback(async (key, fetcher, ttl) => {
        // 1. DEDUPLICACIÓN: Verificar si ya hay una petición en curso
        if (inFlightRequests.current.has(key)) {
            console.log(`[CacheAdmin] Petición duplicada para "${key}". Esperando resultado...`);
            return inFlightRequests.current.get(key);
        }

        // 2. Crear la promesa de la petición
        const fetchPromise = (async () => {
            try {
                console.log(`[CacheAdmin] FETCH: Ejecutando fetcher para "${key}".`);
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
                inFlightRequests.current.delete(key);
            }
        })();

        // 3. Almacenar la promesa en el ref
        inFlightRequests.current.set(key, fetchPromise);

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


    const value = {
        DEFAULT_TTL,
        getCached,
        setCached,
        invalidate,
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