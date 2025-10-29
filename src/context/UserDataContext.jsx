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

    // Claves de caché (sin cambios)
    const INFO_CACHE_KEY = `${CACHE_KEYS.USER_INFO}-${phone}`;
    const ORDERS_CACHE_KEY = `${CACHE_KEYS.USER_ORDERS}-${phone}`;

    // --- fetchCustomerAndAddresses y fetchOrders (sin cambios) ---
    const fetchCustomerAndAddresses = useCallback(async (phoneNumber) => {
        // Fetch Customer (solo campos necesarios inicialmente)
        const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('id, name, phone, created_at, referral_code, referrer_id, referral_count') // <-- Asegúrate de incluir todos los campos relevantes que podrías necesitar actualizar localmente
            .eq('phone', phoneNumber)
            .maybeSingle();

        if (customerError) throw customerError;
        if (!customerData) return { customer: null, addresses: [] }; // Cliente no encontrado

        // Fetch Addresses
        const { data: addressesData, error: addressesError } = await supabase
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', customerData.id)
            .order('is_default', { ascending: false });

        if (addressesError) throw addressesError;

        return { customer: customerData, addresses: addressesData || [] };
    }, []);

    const fetchOrders = useCallback(async (customerId) => {
        // Fetch Orders
        const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('*, order_items(*, products(*))') // Traer items y productos relacionados
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false });

        if (ordersError) throw ordersError;
        return ordersData || [];
    }, []);

    // --- fetchAndCacheUserData (sin cambios) ---
    const fetchAndCacheUserData = useCallback(async (phoneNumber) => {
        if (!phoneNumber) {
            setUserData({ customer: null, addresses: [], orders: [] });
            localStorage.removeItem(INFO_CACHE_KEY);
            localStorage.removeItem(ORDERS_CACHE_KEY);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // 1. Obtener cliente y direcciones
            const { customer, addresses } = await fetchCustomerAndAddresses(phoneNumber);

            if (!customer) {
                setUserData({ customer: null, addresses: [], orders: [] });
                localStorage.removeItem(INFO_CACHE_KEY);
                localStorage.removeItem(ORDERS_CACHE_KEY);
                setLoading(false);
                return;
            }

            const userInfo = { customer, addresses };
            setUserData(prev => ({ ...prev, ...userInfo }));
            setCache(INFO_CACHE_KEY, userInfo, CACHE_TTL.USER_DATA);

            // 2. Obtener órdenes (solo si el cliente existe)
            const fetchedOrders = await fetchOrders(customer.id);
            const limitedOrdersForCache = fetchedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS);
            setUserData(prev => ({ ...prev, orders: fetchedOrders }));
            setCache(ORDERS_CACHE_KEY, limitedOrdersForCache, CACHE_TTL.USER_ORDERS);

        } catch (err) {
            console.error("Error fetching user data:", err);
            setError(err.message);
            // Considerar si resetear todo el estado o mantener lo que se pudo cargar
            setUserData({ customer: null, addresses: [], orders: [] });
            localStorage.removeItem(INFO_CACHE_KEY);
            localStorage.removeItem(ORDERS_CACHE_KEY);
        } finally {
            setLoading(false);
        }
    }, [fetchCustomerAndAddresses, fetchOrders, INFO_CACHE_KEY, ORDERS_CACHE_KEY]); // Dependencias estables

    // useEffect para carga inicial y caché (sin cambios)
    useEffect(() => {
        if (!phone) {
           setUserData({ customer: null, addresses: [], orders: [] });
           setLoading(false);
           return;
        }

        const { data: cachedInfo, isStale: isInfoStale } = getCache(INFO_CACHE_KEY, CACHE_TTL.USER_DATA);
        const { data: cachedOrders, isStale: isOrdersStale } = getCache(ORDERS_CACHE_KEY, CACHE_TTL.USER_ORDERS);

        let needsFreshFetch = true;

        if (cachedInfo) {
            setUserData(prev => ({ ...prev, customer: cachedInfo.customer, addresses: cachedInfo.addresses }));
            if (!isInfoStale) {
               needsFreshFetch = false;
            }
        }
        if (cachedOrders) {
            setUserData(prev => ({ ...prev, orders: cachedOrders }));
             if (!isOrdersStale && !isInfoStale) {
                 needsFreshFetch = false;
             }
        }

        if (needsFreshFetch || !cachedInfo || !cachedOrders) {
            fetchAndCacheUserData(phone);
        } else {
             setLoading(false);
        }

    }, [phone, fetchAndCacheUserData, INFO_CACHE_KEY, ORDERS_CACHE_KEY]); // Dependencias estables


    // --- 👇 useEffect para Real-Time MODIFICADO ---
    useEffect(() => {
        const customerId = userData.customer?.id;
        if (!customerId) return;

        console.log(`[UserDataContext] Configurando listeners para cliente: ${customerId}`);

        // --- HANDLER PARA CAMBIOS EN ORDERS O ADDRESSES (Refetch completo y limpieza caché) ---
        const handleOrderOrAddressChange = (payload) => {
             console.log('[UserDataContext] Cambio detectado en orders/addresses, revalidando todo...', payload);
             // Limpiar ambos cachés antes del refetch para asegurar datos frescos
             localStorage.removeItem(INFO_CACHE_KEY);
             localStorage.removeItem(ORDERS_CACHE_KEY);
             fetchAndCacheUserData(phone); // Refetch completo
        };

        // --- HANDLER PARA CAMBIOS EN CUSTOMER (Actualización local MERGE) ---
        const handleCustomerUpdate = (payload) => {
            console.log('[UserDataContext] Cambio detectado en customers (UPDATE):', payload);
            if (payload.new && payload.new.id === customerId) {
                // Solo actualiza si el cambio es del cliente actual
                const updatedCustomerFields = payload.new;

                setUserData(prev => {
                    // ✅ Solución Problema 1: Merge completo de los datos nuevos sobre los existentes
                    // Esto asegura que cualquier campo actualizado en el backend se refleje localmente.
                    const newCustomerData = { ...prev.customer, ...updatedCustomerFields };

                    console.log('[UserDataContext] Actualizando estado local del cliente:', newCustomerData);

                    // Actualizar caché de Info
                    const infoData = { customer: newCustomerData, addresses: prev.addresses, _timestamp: Date.now() };
                    setCache(INFO_CACHE_KEY, infoData, CACHE_TTL.USER_DATA);

                    // ✅ Solución Problema 3: Invalidar (eliminar) el caché de órdenes
                    // Forzará un refetch de órdenes la próxima vez que se necesiten (ej. recarga o navegación)
                    // lo que asegura consistencia con los datos del cliente recién actualizados.
                    localStorage.removeItem(ORDERS_CACHE_KEY);
                    console.log('[UserDataContext] Caché de órdenes invalidado debido a actualización del cliente.');

                    return { ...prev, customer: newCustomerData };
                });
            }
        };

        // --- Crear canal ---
        const channel = supabase.channel(`public:user-data:${customerId}`);

        // --- Suscripciones ---
        channel.on( // Órdenes
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}` },
            handleOrderOrAddressChange // Usa el handler de refetch completo
        );
        channel.on( // Direcciones
            'postgres_changes',
            { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${customerId}` },
            handleOrderOrAddressChange // Usa el handler de refetch completo
        );
        channel.on( // Cliente (solo UPDATE)
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'customers', filter: `id=eq.${customerId}` },
            handleCustomerUpdate // Usa el handler de actualización local
        );

        // Suscribirse al canal (sin cambios)
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[UserDataContext] Suscrito a cambios para cliente: ${customerId}`);
          }
           if (status === 'CHANNEL_ERROR') { console.error(`[UserDataContext] Error en canal para cliente ${customerId}`); }
            if (status === 'TIMED_OUT') { console.warn(`[UserDataContext] Timeout en canal para cliente ${customerId}`); }
        });

        // Limpieza (sin cambios)
        return () => {
            console.log(`[UserDataContext] Desuscribiendo listeners para cliente: ${customerId}`);
            supabase.removeChannel(channel);
        };

    }, [userData.customer?.id, phone, fetchAndCacheUserData, INFO_CACHE_KEY, ORDERS_CACHE_KEY]); // Dependencias


    const value = { ...userData, loading, error, refetch: () => fetchAndCacheUserData(phone) };

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
};