import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_KEYS, CACHE_TTL } from '../../config/cacheConfig';
import { getAsyncCache, setAsyncCache } from '../../lib/db';
import { subscribeToStoreBroadcast } from '../../lib/broadcastRealtime';
import { supabase } from '../../lib/supabaseClient';
import { fetchBaseCatalog } from './productQueries';
import {
    BASE_ALERT_DELAY_MS,
    CLIENT_CACHE_SCOPE,
    EMPTY_BASE_CATALOG,
    normalizeBaseCatalog,
    serializeBaseCatalog,
    toBasicProducts,
} from './productUtils';

export const useProductCatalog = ({ showAlert }) => {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const catalogRef = useRef(normalizeBaseCatalog(EMPTY_BASE_CATALOG));
    const alertRef = useRef(showAlert);
    const isMountedRef = useRef(false);
    const catalogSignatureRef = useRef(serializeBaseCatalog(EMPTY_BASE_CATALOG));
    const alertTimerRef = useRef(null);
    const realtimeTimerRef = useRef(null);
    const fetchSequenceRef = useRef(0);

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        alertRef.current = showAlert;
    }, [showAlert]);

    const scheduleAlert = useCallback((message, type = 'info', delayMs = BASE_ALERT_DELAY_MS) => {
        if (alertTimerRef.current) return;

        alertTimerRef.current = window.setTimeout(() => {
            alertTimerRef.current = null;
            alertRef.current?.(message, type);
        }, delayMs);
    }, []);

    const applyCatalog = useCallback((nextCatalog) => {
        const normalizedCatalog = normalizeBaseCatalog(nextCatalog);
        const nextSignature = serializeBaseCatalog(normalizedCatalog);
        const hasCatalogChanged = nextSignature !== catalogSignatureRef.current;

        catalogRef.current = normalizedCatalog;
        catalogSignatureRef.current = nextSignature;

        if (hasCatalogChanged) {
            setProducts(normalizedCatalog.products);
            setCategories(normalizedCatalog.categories);
        }

        return normalizedCatalog;
    }, []);

    const persistCatalogCache = useCallback(async (catalog) => {
        await Promise.all([
            setAsyncCache(
                {
                    key: CACHE_KEYS.PRODUCTS,
                    scope: CLIENT_CACHE_SCOPE,
                    ttl: CACHE_TTL.PRODUCTS,
                },
                catalog
            ),
            setAsyncCache(
                {
                    key: CACHE_KEYS.PRODUCTS_BASIC,
                    scope: CLIENT_CACHE_SCOPE,
                    ttl: CACHE_TTL.PRODUCTS,
                },
                toBasicProducts(catalog.products)
            ),
        ]);
    }, []);

    const fetchCatalog = useCallback(async ({ background = false } = {}) => {
        const requestSequence = ++fetchSequenceRef.current;

        if (!background && isMountedRef.current) setLoading(true);

        try {
            const nextCatalog = await fetchBaseCatalog();
            if (requestSequence !== fetchSequenceRef.current) return null;

            if (isMountedRef.current) {
                applyCatalog(nextCatalog);
                setError(null);
            }

            await persistCatalogCache(nextCatalog);
            return nextCatalog;
        } catch (fetchError) {
            console.error('Error fetching base data:', fetchError);

            if (
                requestSequence === fetchSequenceRef.current &&
                isMountedRef.current &&
                !background
            ) {
                setError(fetchError.message);
            }

            return null;
        } finally {
            if (requestSequence === fetchSequenceRef.current && isMountedRef.current) {
                setLoading(false);
            }
        }
    }, [applyCatalog, persistCatalogCache]);

    const handleCatalogChanges = useCallback(() => {
        if (realtimeTimerRef.current) {
            clearTimeout(realtimeTimerRef.current);
        }

        realtimeTimerRef.current = window.setTimeout(() => {
            realtimeTimerRef.current = null;
            scheduleAlert('El menu se ha actualizado!', 'info', 0);
            fetchCatalog({ background: true }).catch(() => { });
        }, BASE_ALERT_DELAY_MS);
    }, [fetchCatalog, scheduleAlert]);

    useEffect(() => {
        const channel = supabase.channel('public:products_categories');

        channel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleCatalogChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleCatalogChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, handleCatalogChanges)
            .subscribe();

        const unsubCatalog = subscribeToStoreBroadcast('catalog_updated', handleCatalogChanges);
        const unsubOrders = subscribeToStoreBroadcast('order_changed', handleCatalogChanges);
        const unsubInventory = subscribeToStoreBroadcast('inventory_updated', handleCatalogChanges);

        return () => {
            if (alertTimerRef.current) {
                clearTimeout(alertTimerRef.current);
                alertTimerRef.current = null;
            }

            if (realtimeTimerRef.current) {
                clearTimeout(realtimeTimerRef.current);
                realtimeTimerRef.current = null;
            }

            if (unsubCatalog) unsubCatalog();
            if (unsubOrders) unsubOrders();
            if (unsubInventory) unsubInventory();
            supabase.removeChannel(channel);
        };
    }, [handleCatalogChanges]);

    useEffect(() => {
        let cancelled = false;

        const initializeCatalog = async () => {
            const { data: cachedCatalog } = await getAsyncCache(CACHE_KEYS.PRODUCTS);

            if (cancelled || !isMountedRef.current) return;

            if (cachedCatalog !== null) {
                applyCatalog(cachedCatalog);
                setLoading(false);
                fetchCatalog({ background: true }).catch(() => { });
                return;
            }

            setLoading(true);
            fetchCatalog().catch(() => { });
        };

        initializeCatalog();

        return () => {
            cancelled = true;
        };
    }, [applyCatalog, fetchCatalog]);

    const refetch = useCallback(
        ({ background = false } = {}) => {
            if (!background) setError(null);
            return fetchCatalog({ background });
        },
        [fetchCatalog]
    );

    return {
        products,
        categories,
        loading,
        error,
        refetch,
    };
};
