import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';

const UserDataContext = createContext();

export const useUserData = () => useContext(UserDataContext);

const USER_DATA_CACHE_KEY = 'ea-user-data-cache';

export const UserDataProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [userData, setUserData] = useState({
        customer: null,
        addresses: [],
        orders: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAndCacheUserData = useCallback(async (phoneNumber) => {
        if (!phoneNumber) {
            setUserData({ customer: null, addresses: [], orders: [] });
            localStorage.removeItem(USER_DATA_CACHE_KEY);
            setLoading(false);
            return;
        }
        setError(null);
        try {
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, phone, created_at, referral_code, referrer_id, referral_count') // <-- Sé explícito con los campos
                .eq('phone', phoneNumber)
                .maybeSingle();

            if (customerError) throw customerError;

            if (!customerData) {
                const emptyUserData = { customer: null, addresses: [], orders: [] };
                setUserData(emptyUserData);
                localStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify(emptyUserData));
                setLoading(false);
                return;
            }

            const { data: addressesData } = await supabase
                .from('customer_addresses').select('*').eq('customer_id', customerData.id);

            const { data: ordersData } = await supabase
                .from('orders').select('*, order_items(*, products(*))')
                .eq('customer_id', customerData.id).order('created_at', { ascending: false });

            const fullUserData = {
                customer: customerData,
                addresses: addressesData || [],
                orders: ordersData || [],
            };

            setUserData(fullUserData);
            localStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify(fullUserData));

        } catch (err) {
            setError(err.message);
        } finally {
            if (loading) setLoading(false);
        }
    }, [loading]);

    useEffect(() => {
        try {
            const cachedData = localStorage.getItem(USER_DATA_CACHE_KEY);
            if (cachedData) {
                setUserData(JSON.parse(cachedData));
            }
        } catch (e) {
            console.error("Error parsing user cache", e);
            localStorage.removeItem(USER_DATA_CACHE_KEY);
        } finally {
            setLoading(false);
        }

        if (phone) {
            fetchAndCacheUserData(phone);
        } else {
           setUserData({ customer: null, addresses: [], orders: [] });
           localStorage.removeItem(USER_DATA_CACHE_KEY);
        }
    }, [phone, fetchAndCacheUserData]);
    useEffect(() => {
        if (!userData.customer?.id) return;

        const handleOrderChanges = (payload) => {
             console.log('Cambio en pedido:', payload);
             setUserData(prev => {
                let newOrders = [...prev.orders];
                if (payload.eventType === 'INSERT') {
                    fetchAndCacheUserData(phone);
                } else if (payload.eventType === 'UPDATE') {
                    newOrders = newOrders.map(order => order.id === payload.new.id ? { ...order, ...payload.new } : order);
                } else if (payload.eventType === 'DELETE') {
                    newOrders = newOrders.filter(order => order.id !== payload.old.id);
                }
                return { ...prev, orders: newOrders };
             });
        };

         const handleAddressChanges = (payload) => {
            setUserData(prev => {
                let newAddresses = [...prev.addresses];
                if (payload.eventType === 'INSERT') {
                    newAddresses.push(payload.new);
                } else if (payload.eventType === 'UPDATE') {
                    newAddresses = newAddresses.map(addr => addr.id === payload.new.id ? payload.new : addr);
                } else if (payload.eventType === 'DELETE') {
                    newAddresses = newAddresses.filter(addr => addr.id !== payload.old.id);
                }
                return { ...prev, addresses: newAddresses };
            });
        };

        const ordersSubscription = supabase.channel(`public:orders:customer=${userData.customer.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userData.customer.id}` }, handleOrderChanges)
            .subscribe();

        const addressesSubscription = supabase.channel(`public:customer_addresses:customer=${userData.customer.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${userData.customer.id}` }, handleAddressChanges)
            .subscribe();

        return () => {
            supabase.removeChannel(ordersSubscription);
            supabase.removeChannel(addressesSubscription);
        };

    }, [userData.customer?.id, fetchAndCacheUserData, phone]);


    const value = { ...userData, loading, error, refetch: () => fetchAndCacheUserData(phone) };

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
};