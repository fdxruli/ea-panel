import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_TTL } from '../../config/cacheConfig';
import { clearAsyncCache, getAsyncCache, setAsyncCache } from '../../lib/db';
import { subscribeToStoreBroadcast } from '../../lib/broadcastRealtime';
import { supabase } from '../../lib/supabaseClient';
import { fetchSpecialPrices } from './productQueries';
import {
    buildSpecialPricesCacheKey,
    CLIENT_CACHE_SCOPE,
    EMPTY_SPECIAL_PRICES,
    normalizeSpecialPrices,
    PRICES_ALERT_DELAY_MS,
} from './productUtils';

export const useSpecialPrices = ({ customerId, showAlert }) => {
    const [specialPrices, setSpecialPrices] = useState(EMPTY_SPECIAL_PRICES);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const alertRef = useRef(showAlert);
    const isMountedRef = useRef(false);
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

    const scheduleAlert = useCallback((message, type = 'info', delayMs = PRICES_ALERT_DELAY_MS) => {
        if (alertTimerRef.current) return;

        alertTimerRef.current = window.setTimeout(() => {
            alertTimerRef.current = null;
            alertRef.current?.(message, type);
        }, delayMs);
    }, []);

    const loadSpecialPrices = useCallback(async (currentCustomerId, { background = false } = {}) => {
        const requestSequence = ++fetchSequenceRef.current;
        const cacheKey = buildSpecialPricesCacheKey(currentCustomerId);

        if (!background && isMountedRef.current) {
            setLoading(true);
        }

        try {
            const fetchedPrices = await fetchSpecialPrices(currentCustomerId);

            if (requestSequence !== fetchSequenceRef.current) return null;

            if (isMountedRef.current) {
                setSpecialPrices(fetchedPrices);
                setError(null);
            }

            await setAsyncCache(
                {
                    key: cacheKey,
                    scope: CLIENT_CACHE_SCOPE,
                    ttl: CACHE_TTL.PRODUCT_EXTRAS,
                },
                fetchedPrices
            );

            return fetchedPrices;
        } catch (fetchError) {
            console.error('Error fetching special prices:', fetchError);

            if (
                requestSequence === fetchSequenceRef.current
                && isMountedRef.current
                && !background
            ) {
                setError(fetchError.message);
            }

            return null;
        } finally {
            if (requestSequence === fetchSequenceRef.current && isMountedRef.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        const pricesChannel = supabase.channel(`public:special_prices:${customerId || 'global'}`);

        const handlePriceChanges = () => {
            if (realtimeTimerRef.current) {
                clearTimeout(realtimeTimerRef.current);
            }

            realtimeTimerRef.current = window.setTimeout(() => {
                realtimeTimerRef.current = null;

                const cacheKey = buildSpecialPricesCacheKey(customerId);
                clearAsyncCache(cacheKey).catch(() => { });

                scheduleAlert('Promociones actualizadas!', 'info', 0);
                loadSpecialPrices(customerId, { background: true }).catch(() => { });
            }, PRICES_ALERT_DELAY_MS);
        };

        pricesChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, handlePriceChanges)
            .subscribe();

        const unsubPricesBroadcast = subscribeToStoreBroadcast('special_prices_updated', handlePriceChanges);
        const unsubDiscountsBroadcast = subscribeToStoreBroadcast('discounts_updated', handlePriceChanges);

        return () => {
            if (alertTimerRef.current) {
                clearTimeout(alertTimerRef.current);
                alertTimerRef.current = null;
            }

            if (realtimeTimerRef.current) {
                clearTimeout(realtimeTimerRef.current);
                realtimeTimerRef.current = null;
            }

            unsubPricesBroadcast?.();
            unsubDiscountsBroadcast?.();
            supabase.removeChannel(pricesChannel);
        };
    }, [customerId, loadSpecialPrices, scheduleAlert]);

    useEffect(() => {
        let cancelled = false;
        const cacheKey = buildSpecialPricesCacheKey(customerId);
        const initSequence = ++fetchSequenceRef.current;

        if (isMountedRef.current) {
            setLoading(true);
        }

        const initializeSpecialPrices = async () => {
            const { data: cachedPrices } = await getAsyncCache(cacheKey);

            if (
                cancelled
                || !isMountedRef.current
                || initSequence !== fetchSequenceRef.current
            ) {
                return;
            }

            if (cachedPrices !== null) {
                setSpecialPrices(normalizeSpecialPrices(cachedPrices));
                setError(null);
                setLoading(false);

                loadSpecialPrices(customerId, { background: true }).catch(() => { });
                return;
            }

            setSpecialPrices([]);
            loadSpecialPrices(customerId).catch(() => { });
        };

        initializeSpecialPrices();

        return () => {
            cancelled = true;
        };
    }, [customerId, loadSpecialPrices]);

    const refetch = useCallback(
        ({ background = false } = {}) => {
            if (!background) setError(null);
            return loadSpecialPrices(customerId, { background });
        },
        [customerId, loadSpecialPrices]
    );

    return {
        specialPrices,
        loading,
        error,
        refetch,
    };
};
