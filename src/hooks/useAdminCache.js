/* src/hooks/useAdminCache.js */
import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CacheAdminContext } from '../context/CacheAdminContext';

/**
 * Hook personalizado para interactuar con el CacheAdminContext.
 * Sigue una API similar a SWR o React Query.
 *
 * @param {string} key - Clave única del caché.
 * @param {function} fetcher - Función ASÍNCRONA (ej. () => supabase.rpc('...')) que devuelve { data, error }.
 * @param {object} options - Opciones de configuración.
 * @param {number} options.ttl - TTL personalizado en ms.
 * @param {boolean} options.enabled - Si el hook debe ejecutarse (default: true).
 * @param {boolean} options.refetchOnMount - Forzar refetch al montar, incluso si hay caché (default: false).
 * @param {boolean} options.staleWhileRevalidate - Devolver datos cacheados (aunque expirados) mientras se hace refetch (default: false).
 * @param {function} options.onSuccess - Callback al tener éxito (data).
 * @param {function} options.onError - Callback al fallar (error).
 */
export const useAdminCache = (key, fetcher, options = {}) => {
    const {
        DEFAULT_TTL,
        getCached,
        handleFetch,
        invalidate,
    } = useContext(CacheAdminContext);

    const {
        ttl = DEFAULT_TTL.MEDIUM,
        enabled = true,
        refetchOnMount = false,
        staleWhileRevalidate = false,
        onSuccess,
        onError
    } = options;

    // Estado del hook
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(enabled);
    const [isError, setIsError] = useState(false);
    const [isCached, setIsCached] = useState(false);
    const [age, setAge] = useState(null);

    // Refs para evitar loops en useEffect
    const fetcherRef = useRef(fetcher);
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);
    
    useEffect(() => {
        fetcherRef.current = fetcher;
        onSuccessRef.current = onSuccess;
        onErrorRef.current = onError;
    }, [fetcher, onSuccess, onError]);


    const executeFetch = useCallback(async (isRefetch = false) => {
        if (!enabled || !key) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setIsError(false);
        setError(null);
        
        try {
            // 1. Consultar caché
            const cachedEntry = getCached(key, { skipExpiry: staleWhileRevalidate });

            if (cachedEntry && !refetchOnMount && !isRefetch) {
                // 2. Usar caché
                
                if (cachedEntry.isExpired && staleWhileRevalidate) {
                    // 2a. Stale-While-Revalidate: Devolver dato "viejo" y hacer refetch
                    console.log(`[useCache] SWR: Devolviendo datos "stale" para "${key}".`);
                    setData(cachedEntry.data);
                    setIsCached(true);
                    setAge(cachedEntry.age);
                    
                    // Iniciar refetch en background (sin await)
                    handleFetch(key, fetcherRef.current, ttl).then(freshData => {
                        setData(freshData); // Actualizar con datos frescos
                        setIsCached(false); // Ya no es de caché
                        setAge(0);
                        onSuccessRef.current?.(freshData);
                    }).catch(err => {
                        // El refetch falló, nos quedamos con los datos stale
                        console.warn(`[useCache] SWR: Refetch falló para "${key}".`, err);
                        // No establecemos error, ya que tenemos datos
                    });
                    
                } else if (!cachedEntry.isExpired) {
                    // 2b. Caché válido
                    console.log(`[useCache] HIT: Usando caché para "${key}".`);
                    setData(cachedEntry.data);
                    setIsCached(true);
                    setAge(cachedEntry.age);
                    onSuccessRef.current?.(cachedEntry.data);
                }
                
            } else {
                 // 3. No hay caché o se fuerza refetch
                console.log(`[useCache] MISS: Haciendo fetch para "${key}".`);
                const freshData = await handleFetch(key, fetcherRef.current, ttl);
                setData(freshData);
                setIsCached(false);
                setAge(0);
                onSuccessRef.current?.(freshData);
            }

        } catch (err) {
            console.error(`[useCache] ERROR: Falló el fetch para "${key}":`, err);
            setError(err);
            setIsError(true);
            setData(null); // Asegurar que no haya datos viejos
            onErrorRef.current?.(err);
        } finally {
            setIsLoading(false);
        }

    }, [key, enabled, refetchOnMount, staleWhileRevalidate, ttl, getCached, handleFetch]);

    // Efecto principal para ejecutar el fetch
    useEffect(() => {
        executeFetch();
    }, [executeFetch]); // executeFetch es estable gracias a useCallback y refs

    // Función de refetch manual
    const refetch = useCallback(() => {
        if (enabled) {
            return executeFetch(true); // true = forzar refetch
        }
        return Promise.resolve();
    }, [enabled, executeFetch]);
    
    // Función de invalidación manual
    const manualInvalidate = useCallback(() => {
        invalidate(key);
    }, [invalidate, key]);

    return {
        data,
        isLoading,
        isError,
        error,
        refetch,
        invalidate: manualInvalidate,
        isCached,
        age
    };
};