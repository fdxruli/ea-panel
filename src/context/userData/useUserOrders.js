import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../../lib/networkState';
import { CACHE_KEYS, CACHE_LIMITS, CACHE_TTL } from '../../config/cacheConfig';
import { getCache, setCache } from '../../utils/cache';
import { subscribeToStoreBroadcast } from '../../lib/broadcastRealtime';
import { fetchOrders } from './userDataQueries';
import {
    areValidOrders,
    EMPTY_ORDERS,
    isNetworkError,
} from './userDataUtils';

export const useUserOrders = ({ enabled, phone, customerId, isCustomerLoading }) => {
    const [orders, setOrders] = useState(EMPTY_ORDERS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const ordersRef = useRef(EMPTY_ORDERS);
    const requestIdRef = useRef(0);

    const ordersCacheKey = `${CACHE_KEYS.USER_ORDERS}-${phone}`;

    const syncOrdersRef = useCallback((nextOrders) => {
        ordersRef.current = nextOrders;
    }, []);

    const resetOrders = useCallback(() => {
        syncOrdersRef(EMPTY_ORDERS);
        setOrders(EMPTY_ORDERS);
    }, [syncOrdersRef]);

    const invalidateOrdersCache = useCallback(() => {
        localStorage.removeItem(ordersCacheKey);
    }, [ordersCacheKey]);

    const fetchAndCacheOrders = useCallback(async ({ background = false } = {}) => {
        const requestId = ++requestIdRef.current;

        if (!enabled) {
            resetOrders();
            setError(null);
            setLoading(false);
            return null;
        }

        if (!phone || !customerId) {
            resetOrders();
            invalidateOrdersCache();
            setError(null);
            setLoading(false);
            return null;
        }

        if (!background) setLoading(true);
        setError(null);

        try {
            const fetchedOrders = await fetchOrders(customerId);
            if (!areValidOrders(fetchedOrders, customerId)) {
                throw new Error('Fresh order response contains an invalid customer identity.');
            }

            if (requestId !== requestIdRef.current) return null;

            syncOrdersRef(fetchedOrders);
            setOrders(fetchedOrders);
            setCache(
                ordersCacheKey,
                fetchedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS),
                CACHE_TTL.USER_ORDERS
            );
            return fetchedOrders;
        } catch (fetchError) {
            if (requestId !== requestIdRef.current) return null;

            console.error('Error fetching user orders:', fetchError);
            if (!isNetworkError(fetchError)) {
                setError(fetchError.message);
                resetOrders();
                invalidateOrdersCache();
            } else {
                if (!areValidOrders(ordersRef.current, customerId)) {
                    resetOrders();
                }
                setError(null);
            }
            return null;
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [
        customerId,
        enabled,
        invalidateOrdersCache,
        ordersCacheKey,
        phone,
        resetOrders,
        syncOrdersRef,
    ]);

    useEffect(() => {
        syncOrdersRef(orders);
    }, [orders, syncOrdersRef]);

    useEffect(() => {
        if (!enabled) {
            ++requestIdRef.current;
            resetOrders();
            setError(null);
            setLoading(false);
            return undefined;
        }

        if (isCustomerLoading) {
            setLoading(true);
            resetOrders();
            return undefined;
        }

        if (!phone || !customerId) {
            ++requestIdRef.current;
            resetOrders();
            invalidateOrdersCache();
            setError(null);
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        const currentRequestId = ++requestIdRef.current;
        const { data: cachedOrders, isStale } = getCache(ordersCacheKey, CACHE_TTL.USER_ORDERS);
        const cacheValid = areValidOrders(cachedOrders, customerId) && !isStale;

        if (!cacheValid) {
            localStorage.removeItem(ordersCacheKey);
            resetOrders();
        } else {
            syncOrdersRef(cachedOrders);
            setOrders(cachedOrders);
            setError(null);
        }

        if (!cacheValid) {
            fetchAndCacheOrders().catch(() => { });
        } else if (!cancelled) {
            setLoading(false);
        }

        return () => {
            cancelled = true;
            if (requestIdRef.current === currentRequestId) requestIdRef.current += 1;
        };
    }, [
        customerId,
        enabled,
        fetchAndCacheOrders,
        invalidateOrdersCache,
        isCustomerLoading,
        ordersCacheKey,
        phone,
        resetOrders,
        syncOrdersRef,
    ]);

    useEffect(() => {
        if (!enabled || !customerId || isCustomerLoading) return undefined;

        const handleOrderInsert = () => {
            fetchAndCacheOrders({ background: true }).catch(() => { });
        };

        const handleOrderUpdate = (payload) => {
            if (payload.new?.customer_id !== customerId) return;
            const currentOrders = ordersRef.current;
            if (!currentOrders.some(order => order.id === payload.new.id)) return;

            const updatedOrders = currentOrders.map(order => (
                order.id === payload.new.id ? { ...order, ...payload.new } : order
            ));
            if (!areValidOrders(updatedOrders, customerId)) return;

            syncOrdersRef(updatedOrders);
            setOrders(updatedOrders);
            setCache(
                ordersCacheKey,
                updatedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS),
                CACHE_TTL.USER_ORDERS
            );

            window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent('order-status-updated', {
                    detail: {
                        orderCode: payload.new.order_code,
                        status: payload.new.status,
                    },
                }));
            }, 0);
        };

        const channel = supabase.channel(`public:user-orders:${customerId}`);

        channel.on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}`,
        }, handleOrderInsert);
        channel.on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}`,
        }, handleOrderUpdate);

        channel.subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [
        customerId,
        enabled,
        fetchAndCacheOrders,
        isCustomerLoading,
        ordersCacheKey,
        syncOrdersRef,
    ]);

    useEffect(() => {
        if (!enabled) return undefined;

        const handleBroadcastOrder = (data) => {
            if (!data?.orderCode) return;
            const currentOrders = ordersRef.current || EMPTY_ORDERS;
            const existing = currentOrders.find(order => order.order_code === data.orderCode);
            if (!existing) return;

            const updatedOrders = currentOrders.map(order => (
                order.order_code === data.orderCode ? { ...order, ...data } : order
            ));
            syncOrdersRef(updatedOrders);
            setOrders(updatedOrders);
            setCache(
                ordersCacheKey,
                updatedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS),
                CACHE_TTL.USER_ORDERS
            );

            window.dispatchEvent(new CustomEvent('order-status-updated', {
                detail: {
                    orderCode: data.orderCode,
                    status: data.status,
                },
            }));
        };

        const unsubscribe = subscribeToStoreBroadcast('order_changed', handleBroadcastOrder);
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [enabled, ordersCacheKey, syncOrdersRef]);

    useEffect(() => {
        if (!enabled) return undefined;

        const reconcileOnFocus = () => {
            if (document.visibilityState !== 'visible' || !phone || !customerId || isCustomerLoading) return;
            fetchAndCacheOrders({ background: true }).catch(() => { });
        };

        document.addEventListener('visibilitychange', reconcileOnFocus);
        window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
        return () => {
            document.removeEventListener('visibilitychange', reconcileOnFocus);
            window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
        };
    }, [customerId, enabled, fetchAndCacheOrders, isCustomerLoading, phone]);

    const clear = useCallback(() => {
        ++requestIdRef.current;
        invalidateOrdersCache();
        resetOrders();
        setError(null);
        setLoading(false);
    }, [invalidateOrdersCache, resetOrders]);

    const refetch = useCallback(
        () => fetchAndCacheOrders(),
        [fetchAndCacheOrders]
    );

    return {
        orders,
        loading,
        error,
        refetch,
        clear,
    };
};
