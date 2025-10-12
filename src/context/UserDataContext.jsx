<<<<<<< HEAD
// src/context/UserDataContext.jsx

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL, CACHE_LIMITS } from '../config/cacheConfig';

const UserDataContext = createContext();

export const useUserData = () => useContext(UserDataContext);

export const UserDataProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [userData, setUserData] = useState({
        customer: null,
        addresses: [],
        orders: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const INFO_CACHE_KEY = `${CACHE_KEYS.USER_INFO}-${phone}`;
    const ORDERS_CACHE_KEY = `${CACHE_KEYS.USER_ORDERS}-${phone}`;

    const fetchAndCacheUserData = useCallback(async (phoneNumber) => {
        if (!phoneNumber) {
            setUserData({ customer: null, addresses: [], orders: [] });
            localStorage.removeItem(INFO_CACHE_KEY);
            localStorage.removeItem(ORDERS_CACHE_KEY);
            setLoading(false);
            return;
        }
        setError(null);
        try {
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, phone, created_at, referral_code, referrer_id, referral_count')
                .eq('phone', phoneNumber)
                .maybeSingle();

            if (customerError) throw customerError;

            if (!customerData) {
                setUserData({ customer: null, addresses: [], orders: [] });
                setCache(INFO_CACHE_KEY, { customer: null, addresses: [] });
                setCache(ORDERS_CACHE_KEY, []);
                setLoading(false);
                return;
            }

            const { data: addressesData } = await supabase
                .from('customer_addresses').select('*').eq('customer_id', customerData.id);

            const userInfo = {
                customer: customerData,
                addresses: addressesData || [],
            };
            setUserData(prev => ({ ...prev, ...userInfo }));
            setCache(INFO_CACHE_KEY, userInfo);
            
            const { data: ordersData } = await supabase
                .from('orders').select('*, order_items(*, products(*))')
                .eq('customer_id', customerData.id)
                .order('created_at', { ascending: false });
            
            const limitedOrders = (ordersData || []).slice(0, CACHE_LIMITS.RECENT_ORDERS);
            setUserData(prev => ({ ...prev, orders: ordersData || [] }));
            setCache(ORDERS_CACHE_KEY, limitedOrders);

        } catch (err) {
            setError(err.message);
        } finally {
            if (loading) setLoading(false);
        }
    }, [loading, INFO_CACHE_KEY, ORDERS_CACHE_KEY]);

    useEffect(() => {
        if (!phone) {
           setUserData({ customer: null, addresses: [], orders: [] });
           setLoading(false);
           return;
        }

        const { data: cachedInfo, isStale: isInfoStale } = getCache(INFO_CACHE_KEY, CACHE_TTL.USER_DATA);
        const { data: cachedOrders, isStale: isOrdersStale } = getCache(ORDERS_CACHE_KEY, CACHE_TTL.USER_ORDERS);

        if (cachedInfo && cachedOrders) {
            setUserData({ ...cachedInfo, orders: cachedOrders });
            setLoading(false);
        }
        
        if (isInfoStale || isOrdersStale) {
            fetchAndCacheUserData(phone);
        }

    }, [phone, fetchAndCacheUserData, INFO_CACHE_KEY, ORDERS_CACHE_KEY]);
    
    useEffect(() => {
        if (!userData.customer?.id) return;

        const handleChanges = () => {
             console.log('Cambio detectado en los datos del usuario, revalidando...');
             fetchAndCacheUserData(phone);
        };

        const channel = supabase.channel(`public:user-data:${userData.customer.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userData.customer.id}` }, handleChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${userData.customer.id}` }, handleChanges)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [userData.customer?.id, fetchAndCacheUserData, phone]);

    const value = { ...userData, loading, error, refetch: () => fetchAndCacheUserData(phone) };

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
=======
// src/context/UserDataContext.jsx

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL, CACHE_LIMITS } from '../config/cacheConfig';

const UserDataContext = createContext();

export const useUserData = () => useContext(UserDataContext);

export const UserDataProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [userData, setUserData] = useState({
        customer: null,
        addresses: [],
        orders: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const INFO_CACHE_KEY = `${CACHE_KEYS.USER_INFO}-${phone}`;
    const ORDERS_CACHE_KEY = `${CACHE_KEYS.USER_ORDERS}-${phone}`;

    const fetchAndCacheUserData = useCallback(async (phoneNumber) => {
        if (!phoneNumber) {
            setUserData({ customer: null, addresses: [], orders: [] });
            localStorage.removeItem(INFO_CACHE_KEY);
            localStorage.removeItem(ORDERS_CACHE_KEY);
            setLoading(false);
            return;
        }
        setError(null);
        try {
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, phone, created_at, referral_code, referrer_id, referral_count')
                .eq('phone', phoneNumber)
                .maybeSingle();

            if (customerError) throw customerError;

            if (!customerData) {
                setUserData({ customer: null, addresses: [], orders: [] });
                setCache(INFO_CACHE_KEY, { customer: null, addresses: [] });
                setCache(ORDERS_CACHE_KEY, []);
                setLoading(false);
                return;
            }

            const { data: addressesData } = await supabase
                .from('customer_addresses').select('*').eq('customer_id', customerData.id);

            const userInfo = {
                customer: customerData,
                addresses: addressesData || [],
            };
            setUserData(prev => ({ ...prev, ...userInfo }));
            setCache(INFO_CACHE_KEY, userInfo);
            
            const { data: ordersData } = await supabase
                .from('orders').select('*, order_items(*, products(*))')
                .eq('customer_id', customerData.id)
                .order('created_at', { ascending: false });
            
            const limitedOrders = (ordersData || []).slice(0, CACHE_LIMITS.RECENT_ORDERS);
            setUserData(prev => ({ ...prev, orders: ordersData || [] }));
            setCache(ORDERS_CACHE_KEY, limitedOrders);

        } catch (err) {
            setError(err.message);
        } finally {
            if (loading) setLoading(false);
        }
    }, [loading, INFO_CACHE_KEY, ORDERS_CACHE_KEY]);

    useEffect(() => {
        if (!phone) {
           setUserData({ customer: null, addresses: [], orders: [] });
           setLoading(false);
           return;
        }

        const { data: cachedInfo, isStale: isInfoStale } = getCache(INFO_CACHE_KEY, CACHE_TTL.USER_DATA);
        const { data: cachedOrders, isStale: isOrdersStale } = getCache(ORDERS_CACHE_KEY, CACHE_TTL.USER_ORDERS);

        if (cachedInfo && cachedOrders) {
            setUserData({ ...cachedInfo, orders: cachedOrders });
            setLoading(false);
        }
        
        if (isInfoStale || isOrdersStale) {
            fetchAndCacheUserData(phone);
        }

    }, [phone, fetchAndCacheUserData, INFO_CACHE_KEY, ORDERS_CACHE_KEY]);
    
    useEffect(() => {
        if (!userData.customer?.id) return;

        const handleChanges = () => {
             console.log('Cambio detectado en los datos del usuario, revalidando...');
             fetchAndCacheUserData(phone);
        };

        const channel = supabase.channel(`public:user-data:${userData.customer.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userData.customer.id}` }, handleChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${userData.customer.id}` }, handleChanges)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [userData.customer?.id, fetchAndCacheUserData, phone]);

    const value = { ...userData, loading, error, refetch: () => fetchAndCacheUserData(phone) };

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
};