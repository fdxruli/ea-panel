// src/context/UserDataContext.jsx (CORREGIDO)

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

        setLoading(true);
        setError(null);
        try {
            const { data: customerData, error: customerError } = await supabase
                .from('customers').select('*').eq('phone', phoneNumber).maybeSingle();

            // Si hay un error real con la base de datos, lo lanzamos.
            if (customerError) throw customerError;

            // Si no se encuentra el cliente, es un usuario nuevo. No es un error.
            if (!customerData) {
                const emptyUserData = { customer: null, addresses: [], orders: [] };
                setUserData(emptyUserData);
                // Guardamos en caché que para este número no hay datos.
                localStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify(emptyUserData));
                setLoading(false);
                return; // Salimos de la función exitosamente.
            }

            // Si el cliente fue encontrado, procedemos a buscar sus datos.
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

        } catch (err) { // Esto ahora solo atrapará errores reales (ej. de red).
            setError(err.message);
            setUserData({ customer: null, addresses: [], orders: [] });
            localStorage.removeItem(USER_DATA_CACHE_KEY);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const cachedData = localStorage.getItem(USER_DATA_CACHE_KEY);
        if (cachedData) {
            setUserData(JSON.parse(cachedData));
            setLoading(false);
        }
        if (phone) {
            fetchAndCacheUserData(phone);
        } else {
           setLoading(false);
           setUserData({ customer: null, addresses: [], orders: [] });
           localStorage.removeItem(USER_DATA_CACHE_KEY);
        }
    }, [phone, fetchAndCacheUserData]);

    useEffect(() => {
        if (!userData.customer?.id) return;

        const handleCustomerUpdate = (payload) => {
            if (payload.new.id === userData.customer.id) {
                console.log('Real-time update for customer:', payload.new);
                setUserData(prev => ({ ...prev, customer: payload.new }));
            }
        };
        const handleAddressUpdate = () => {
             console.log('Real-time update for addresses detected, refetching...');
             fetchAndCacheUserData(phone);
        };
         const handleOrderUpdate = () => {
             console.log('Real-time update for orders detected, refetching...');
             fetchAndCacheUserData(phone);
        };


        const customersSubscription = supabase.channel('public:customers')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers' }, handleCustomerUpdate)
            .subscribe();
        
        const addressesSubscription = supabase.channel('public:customer_addresses')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${userData.customer.id}` }, handleAddressUpdate)
            .subscribe();

        const ordersSubscription = supabase.channel('public:orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userData.customer.id}` }, handleOrderUpdate)
            .subscribe();

        return () => {
            supabase.removeChannel(customersSubscription);
            supabase.removeChannel(addressesSubscription);
            supabase.removeChannel(ordersSubscription);
        };

    }, [userData.customer?.id, fetchAndCacheUserData, phone]);


    const value = { ...userData, loading, error, refetch: () => fetchAndCacheUserData(phone) };

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
};