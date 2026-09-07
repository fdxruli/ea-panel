// src/context/UserDataContext.jsx
import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL, CACHE_LIMITS } from '../config/cacheConfig';
import { subscribeToStoreBroadcast } from '../lib/broadcastRealtime';

const UserDataContext = createContext();
export const useUserData = () => useContext(UserDataContext);

const EMPTY_USER_DATA = { customer: null, addresses: [], orders: [] };

const isValidCustomer = (customer, canonicalCustomerId) => Boolean(customer?.id && canonicalCustomerId && customer.id === canonicalCustomerId);
const areValidOrders = (orders, canonicalCustomerId) => Array.isArray(orders) && orders.every(order => order?.customer_id === canonicalCustomerId);

export const UserDataProvider = ({ children }) => {
    const { customer: canonicalCustomer, customerId, isCustomerLoading, isAuthenticated, isLinked } = useCustomer();
    const [userData, setUserData] = useState(EMPTY_USER_DATA);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const requestIdRef = useRef(0);
    const customerRef = useRef(null);
    const addressesRef = useRef([]);
    const ordersRef = useRef([]);

    const infoCacheKey = `${CACHE_KEYS.USER_INFO}-${customerId || 'anonymous'}`;
    const ordersCacheKey = `${CACHE_KEYS.USER_ORDERS}-${customerId || 'anonymous'}`;

    const syncRefs = useCallback((next) => {
        customerRef.current = next.customer;
        addressesRef.current = next.addresses;
        ordersRef.current = next.orders;
    }, []);

    const resetUserData = useCallback(() => {
        syncRefs(EMPTY_USER_DATA);
        setUserData(EMPTY_USER_DATA);
    }, [syncRefs]);

    const invalidateCaches = useCallback(() => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(infoCacheKey);
        localStorage.removeItem(ordersCacheKey);
    }, [infoCacheKey, ordersCacheKey]);

    const fetchUserData = useCallback(async (expectedCustomerId) => {
        const requestId = ++requestIdRef.current;
        if (!isAuthenticated || !isLinked || !expectedCustomerId) {
            resetUserData();
            invalidateCaches();
            setLoading(Boolean(isCustomerLoading));
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, phone, created_at, referral_code, referrer_id, referral_count, has_made_first_purchase')
                .eq('id', expectedCustomerId)
                .maybeSingle();
            if (customerError) throw customerError;
            if (!customerData || customerData.id !== expectedCustomerId) throw Object.assign(new Error('Customer identity mismatch.'), { code: 'CANONICAL_ID_CHANGED' });

            const { data: addressesData, error: addressesError } = await supabase
                .from('customer_addresses')
                .select('*')
                .eq('customer_id', expectedCustomerId)
                .order('is_default', { ascending: false });
            if (addressesError) throw addressesError;

            const { data: ordersData, error: ordersError } = await supabase
                .from('orders')
                .select('*, order_items(*, products(*))')
                .eq('customer_id', expectedCustomerId)
                .order('created_at', { ascending: false });
            if (ordersError) throw ordersError;
            const safeOrders = ordersData || [];
            if (!areValidOrders(safeOrders, expectedCustomerId)) throw new Error('Fresh order response contains an invalid customer identity.');
            if (requestId !== requestIdRef.current || expectedCustomerId !== customerId) return;

            const next = { customer: customerData, addresses: addressesData || [], orders: safeOrders };
            syncRefs(next);
            setUserData(next);
            setCache(infoCacheKey, { customer: customerData, addresses: addressesData || [] }, CACHE_TTL.USER_DATA);
            setCache(ordersCacheKey, safeOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS), CACHE_TTL.USER_ORDERS);
        } catch (err) {
            if (requestId !== requestIdRef.current) return;
            const message = String(err?.message || '');
            const isNetworkError = err instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed|fetch|timeout/i.test(message);
            console.error('[UserDataContext] Error fetching user data:', err);
            if (!isNetworkError) {
                setError(err?.code === 'P0001' ? 'No se pudo validar tu sesión.' : message);
                resetUserData();
                invalidateCaches();
            } else if (!isValidCustomer(customerRef.current, customerId)) {
                resetUserData();
            }
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [customerId, infoCacheKey, invalidateCaches, isAuthenticated, isCustomerLoading, isLinked, ordersCacheKey, resetUserData, syncRefs]);

    useEffect(() => {
        if (isCustomerLoading) {
            setLoading(true);
            resetUserData();
            return undefined;
        }
        if (!isAuthenticated || !isLinked || !customerId) {
            ++requestIdRef.current;
            resetUserData();
            invalidateCaches();
            setLoading(false);
            return undefined;
        }

        const { data: cachedInfo, isStale: infoStale } = getCache(infoCacheKey, CACHE_TTL.USER_DATA);
        const { data: cachedOrders, isStale: ordersStale } = getCache(ordersCacheKey, CACHE_TTL.USER_ORDERS);
        const infoValid = isValidCustomer(cachedInfo?.customer, customerId) && !infoStale;
        const ordersValid = infoValid && areValidOrders(cachedOrders, customerId) && !ordersStale;

        if (infoValid) {
            const cachedUserData = {
                customer: cachedInfo.customer,
                addresses: Array.isArray(cachedInfo.addresses) ? cachedInfo.addresses : [],
                orders: ordersValid ? cachedOrders : [],
            };
            syncRefs(cachedUserData);
            setUserData(cachedUserData);
        } else {
            resetUserData();
        }

        if (!infoValid || !ordersValid) fetchUserData(customerId);
        else setLoading(false);

        return () => {
            requestIdRef.current += 1;
        };
    }, [customerId, fetchUserData, infoCacheKey, invalidateCaches, isAuthenticated, isCustomerLoading, isLinked, ordersCacheKey, resetUserData, syncRefs]);

    useEffect(() => {
        if (!customerId || isCustomerLoading || !isAuthenticated || !isLinked) return undefined;
        const refresh = () => fetchUserData(customerId);
        const updateCustomer = (payload) => {
            if (payload.new?.id !== customerId) return;
            const nextCustomer = { ...customerRef.current, ...payload.new };
            if (!isValidCustomer(nextCustomer, customerId)) return;
            const next = { customer: nextCustomer, addresses: addressesRef.current, orders: ordersRef.current };
            syncRefs(next);
            setUserData(next);
            setCache(infoCacheKey, { customer: nextCustomer, addresses: addressesRef.current }, CACHE_TTL.USER_DATA);
        };
        const updateOrder = (payload) => {
            if (payload.new?.customer_id !== customerId) return;
            const updated = ordersRef.current.some(order => order.id === payload.new.id)
                ? ordersRef.current.map(order => order.id === payload.new.id ? { ...order, ...payload.new } : order)
                : ordersRef.current;
            if (!areValidOrders(updated, customerId)) return;
            syncRefs({ customer: customerRef.current, addresses: addressesRef.current, orders: updated });
            setUserData(prev => ({ ...prev, orders: updated }));
            setCache(ordersCacheKey, updated.slice(0, CACHE_LIMITS.RECENT_ORDERS), CACHE_TTL.USER_ORDERS);
            window.setTimeout(() => window.dispatchEvent(new CustomEvent('order-status-updated', { detail: { orderCode: payload.new.order_code, status: payload.new.status } })), 0);
        };

        const channel = supabase.channel(`public:user-data:${customerId}`);
        channel
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}` }, refresh)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}` }, updateOrder)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${customerId}` }, refresh)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers', filter: `id=eq.${customerId}` }, updateCustomer)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [customerId, fetchUserData, infoCacheKey, isAuthenticated, isCustomerLoading, isLinked, ordersCacheKey, syncRefs]);

    useEffect(() => {
        const handleBroadcastOrder = (data) => {
            if (!data?.orderCode || !customerId) return;
            const updated = ordersRef.current.map(order => order.order_code === data.orderCode ? { ...order, ...data } : order);
            if (updated.some((order, index) => order !== ordersRef.current[index])) {
                syncRefs({ customer: customerRef.current, addresses: addressesRef.current, orders: updated });
                setUserData(prev => ({ ...prev, orders: updated }));
                setCache(ordersCacheKey, updated.slice(0, CACHE_LIMITS.RECENT_ORDERS), CACHE_TTL.USER_ORDERS);
            }
        };
        const unsubscribe = subscribeToStoreBroadcast('order_changed', handleBroadcastOrder);
        return () => unsubscribe?.();
    }, [customerId, ordersCacheKey, syncRefs]);

    useEffect(() => {
        const reconcile = () => {
            if (document.visibilityState === 'visible' && isAuthenticated && isLinked && customerId) fetchUserData(customerId);
        };
        document.addEventListener('visibilitychange', reconcile);
        window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcile);
        return () => {
            document.removeEventListener('visibilitychange', reconcile);
            window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcile);
        };
    }, [customerId, fetchUserData, isAuthenticated, isLinked]);

    const logout = useCallback(() => {
        ++requestIdRef.current;
        resetUserData();
        invalidateCaches();
    }, [invalidateCaches, resetUserData]);

    const refetch = useCallback(() => fetchUserData(customerId), [customerId, fetchUserData]);

    const value = useMemo(() => ({ ...userData, loading, error, refetch, logout }), [error, loading, logout, refetch, userData]);
    return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};
