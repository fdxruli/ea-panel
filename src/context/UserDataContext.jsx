// src/context/UserDataContext.jsx (OPTIMIZADO)

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
    const [loading, setLoading] = useState(true); // Se mantiene para la carga inicial absoluta
    const [error, setError] = useState(null);

    const fetchAndCacheUserData = useCallback(async (phoneNumber) => {
        if (!phoneNumber) {
            setUserData({ customer: null, addresses: [], orders: [] });
            localStorage.removeItem(USER_DATA_CACHE_KEY);
            setLoading(false);
            return;
        }

        // No mostramos un loader aquí para que la actualización sea en segundo plano
        setError(null);
        try {
            const { data: customerData, error: customerError } = await supabase
                .from('customers').select('*').eq('phone', phoneNumber).maybeSingle();

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
            // No limpiamos los datos si falla, el usuario puede seguir viendo los datos cacheados.
        } finally {
            // El loading principal solo se desactiva una vez, en el useEffect de montaje.
            if (loading) setLoading(false);
        }
    }, [loading]); // Se añade 'loading' a las dependencias

    // --- 👇 AQUÍ ESTÁ LA OPTIMIZACIÓN PRINCIPAL ---
    useEffect(() => {
        // Paso 1: Intentar cargar desde el caché INMEDIATAMENTE
        try {
            const cachedData = localStorage.getItem(USER_DATA_CACHE_KEY);
            if (cachedData) {
                setUserData(JSON.parse(cachedData));
            }
        } catch (e) {
            console.error("Error parsing user cache", e);
            localStorage.removeItem(USER_DATA_CACHE_KEY);
        } finally {
            // Siempre quitamos el loader después de checar el caché.
            // La app se siente instantánea.
            setLoading(false);
        }

        // Paso 2: Si hay un teléfono, buscar datos frescos en segundo plano
        if (phone) {
            fetchAndCacheUserData(phone);
        } else {
           // Si no hay teléfono, limpiar todo
           setUserData({ customer: null, addresses: [], orders: [] });
           localStorage.removeItem(USER_DATA_CACHE_KEY);
        }
    }, [phone, fetchAndCacheUserData]);
    // --- 👆 FIN DE LA OPTIMIZACIÓN ---


    useEffect(() => {
        if (!userData.customer?.id) return;

        const handleChanges = () => {
             console.log('Real-time change detected for user data, refetching...');
             fetchAndCacheUserData(phone);
        };

        const customersSubscription = supabase.channel(`public:customers:${userData.customer.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers', filter: `id=eq.${userData.customer.id}` }, (payload) => {
                console.log('Real-time update for customer:', payload.new);
                setUserData(prev => ({ ...prev, customer: payload.new }));
            })
            .subscribe();

        const addressesSubscription = supabase.channel(`public:customer_addresses:${userData.customer.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${userData.customer.id}` }, handleChanges)
            .subscribe();

        const ordersSubscription = supabase.channel(`public:orders:${userData.customer.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userData.customer.id}` }, handleChanges)
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