/* src/hooks/useAdminCache.js */
import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CacheAdminContext } from '../context/CacheAdminContext';

export const useAdminCache = (key, fetcher, options = {}) => {
    const {
        DEFAULT_TTL,
        isHydrated,
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

    const effectiveEnabled = enabled && isHydrated;

    // Obtener entrada de caché síncronamente si ya está disponible en memoria
    const initialCachedEntry = (isHydrated && key)
        ? getCached(key, { skipExpiry: staleWhileRevalidate })
        : null;
    const hasInitialValidCache = initialCachedEntry && (staleWhileRevalidate || !initialCachedEntry.isExpired);

    const [data, setData] = useState(() => hasInitialValidCache ? initialCachedEntry.data : null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(() => hasInitialValidCache ? false : (enabled && !isHydrated ? true : enabled));
    const [isError, setIsError] = useState(false);
    const [isCached, setIsCached] = useState(() => !!hasInitialValidCache);
    const [age, setAge] = useState(() => initialCachedEntry ? initialCachedEntry.age : null);

    const fetcherRef = useRef(fetcher);
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        fetcherRef.current = fetcher;
        onSuccessRef.current = onSuccess;
        onErrorRef.current = onError;
    }, [fetcher, onSuccess, onError]);

    const executeFetch = useCallback(async (isRefetch = false) => {
        if (!effectiveEnabled || !key) {
            setIsLoading(!isHydrated && enabled);
            return;
        }

        const cachedEntry = getCached(key, { skipExpiry: staleWhileRevalidate });

        if (cachedEntry && !refetchOnMount && !isRefetch) {
            if (cachedEntry.isExpired && staleWhileRevalidate) {
                // SWR: Mantener datos cacheados visibles y revalidar silenciosamente en segundo plano
                setData(cachedEntry.data);
                setIsCached(true);
                setAge(cachedEntry.age);
                setIsLoading(false);

                handleFetch(key, fetcherRef.current, ttl).then(freshData => {
                    setData(freshData);
                    setIsCached(false);
                    setAge(0);
                    onSuccessRef.current?.(freshData);
                }).catch(err => {
                    console.warn(`[useCache] SWR: Refetch falló para "${key}".`, err);
                });
                return;
            } else if (!cachedEntry.isExpired) {
                // Datos en caché totalmente válidos: sincronizar estado sin hacer fetch
                setData(cachedEntry.data);
                setIsCached(true);
                setAge(cachedEntry.age);
                setIsLoading(false);
                setIsError(false);
                setError(null);
                onSuccessRef.current?.(cachedEntry.data);
                return;
            }
        }

        // Si no hay caché válido o es refetch explícito, ejecutar fetch
        setIsLoading(true);
        setIsError(false);
        setError(null);

        try {
            const freshData = await handleFetch(key, fetcherRef.current, ttl);
            setData(freshData);
            setIsCached(false);
            setAge(0);
            onSuccessRef.current?.(freshData);
        } catch (err) {
            console.error(`[useCache] ERROR: Falló el fetch para "${key}":`, err);
            setError(err);
            setIsError(true);
            setData(null);
            onErrorRef.current?.(err);
        } finally {
            setIsLoading(false);
        }
    }, [key, effectiveEnabled, isHydrated, enabled, refetchOnMount, staleWhileRevalidate, ttl, getCached, handleFetch]);

    useEffect(() => {
        executeFetch();
    }, [executeFetch]);

    const refetch = useCallback(() => {
        if (effectiveEnabled) return executeFetch(true);
        return Promise.resolve();
    }, [effectiveEnabled, executeFetch]);

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
