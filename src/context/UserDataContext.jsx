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

    // fetchAndCacheUserData (sin cambios)
    const fetchAndCacheUserData = useCallback(async (phoneNumber) => {
        // ... (lógica interna sin cambios) ...
        if (!phoneNumber) {
            setUserData({ customer: null, addresses: [], orders: [] });
            localStorage.removeItem(INFO_CACHE_KEY);
            localStorage.removeItem(ORDERS_CACHE_KEY);
            setLoading(false);
            return;
        }
        setLoading(true); // Indicar carga al refetch manual o por listener
        setError(null);
        try {
            // Fetch Customer
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('id, name, phone, created_at, referral_code, referrer_id, referral_count') // Asegúrate de incluir referral_count
                .eq('phone', phoneNumber)
                .maybeSingle();

            if (customerError) throw customerError;

            if (!customerData) {
                // Si el cliente no existe (ej. cambió número y no existe el nuevo)
                setUserData({ customer: null, addresses: [], orders: [] });
                localStorage.removeItem(INFO_CACHE_KEY); // Limpiar caché viejo
                localStorage.removeItem(ORDERS_CACHE_KEY);
                setLoading(false);
                return;
            }

            // Fetch Addresses
            const { data: addressesData, error: addressesError } = await supabase
                .from('customer_addresses')
                .select('*')
                .eq('customer_id', customerData.id)
                .order('is_default', { ascending: false }); // Ordenar por defecto

             if (addressesError) throw addressesError;

            const userInfo = {
                customer: customerData,
                addresses: addressesData || [],
            };
            // Actualizar estado y caché de Info
            setUserData(prev => ({ ...prev, ...userInfo }));
            setCache(INFO_CACHE_KEY, userInfo, CACHE_TTL.USER_DATA); // Actualizar caché

            // Fetch Orders
            const { data: ordersData, error: ordersError } = await supabase
                .from('orders')
                .select('*, order_items(*, products(*))') // Traer items y productos relacionados
                .eq('customer_id', customerData.id)
                .order('created_at', { ascending: false });

            if (ordersError) throw ordersError;

            const fetchedOrders = ordersData || [];
            // Aplicar límite solo para el caché, pero mantener todos en el estado
            const limitedOrdersForCache = fetchedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS);
            setUserData(prev => ({ ...prev, orders: fetchedOrders }));
            setCache(ORDERS_CACHE_KEY, limitedOrdersForCache, CACHE_TTL.USER_ORDERS); // Actualizar caché

        } catch (err) {
            console.error("Error fetching user data:", err);
            setError(err.message);
        } finally {
            setLoading(false); // Quitar loading al final
        }
    }, [INFO_CACHE_KEY, ORDERS_CACHE_KEY]); // Dependencias estables

    // useEffect para carga inicial y caché (sin cambios)
    useEffect(() => {
        // ... (lógica interna sin cambios) ...
        if (!phone) {
           setUserData({ customer: null, addresses: [], orders: [] });
           setLoading(false);
           return;
        }

        const { data: cachedInfo, isStale: isInfoStale } = getCache(INFO_CACHE_KEY, CACHE_TTL.USER_DATA);
        const { data: cachedOrders, isStale: isOrdersStale } = getCache(ORDERS_CACHE_KEY, CACHE_TTL.USER_ORDERS);

        let needsFreshFetch = true; // Asumir que necesitamos fetch por defecto

        if (cachedInfo) {
            // Si hay caché de info, usarla (incluso si está 'stale', para mostrar algo rápido)
            setUserData(prev => ({ ...prev, customer: cachedInfo.customer, addresses: cachedInfo.addresses }));
            if (!isInfoStale) { // Si la info NO está stale
               needsFreshFetch = false; // Quizás no necesitamos fetch inmediato de info
            }
        }
        if (cachedOrders) {
             // Usar caché de órdenes si existe
            setUserData(prev => ({ ...prev, orders: cachedOrders }));
             if (!isOrdersStale && !isInfoStale) { // Si NINGUNO está stale
                 needsFreshFetch = false; // Definitivamente no necesitamos fetch
             }
        }

        // Si algún caché está stale o no existe, o si no hay caché, fetchear
        if (needsFreshFetch || !cachedInfo || !cachedOrders) {
            fetchAndCacheUserData(phone);
        } else {
             setLoading(false); // Si usamos solo caché y no está stale, quitamos loading
        }


    }, [phone, fetchAndCacheUserData, INFO_CACHE_KEY, ORDERS_CACHE_KEY]); // Dependencias estables


    // --- 👇 useEffect para Real-Time MODIFICADO ---
    useEffect(() => {
        // Solo configurar listeners si tenemos un ID de cliente
        const customerId = userData.customer?.id;
        if (!customerId) return;

        console.log(`[UserDataContext] Configurando listeners para cliente: ${customerId}`);

        // Callback unificado para manejar cambios
        const handleChanges = (payload) => {
             console.log('[UserDataContext] Cambio detectado, revalidando datos...', payload);
             // Limpiar caché específico antes de refetch para asegurar datos frescos
             localStorage.removeItem(INFO_CACHE_KEY);
             localStorage.removeItem(ORDERS_CACHE_KEY);
             fetchAndCacheUserData(phone); // Llama a la función de fetch principal
        };

        // Crear canal específico para este cliente
        const channel = supabase.channel(`public:user-data:${customerId}`);

        // Escuchar cambios en las órdenes del cliente
        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}` },
            handleChanges
        );

        // Escuchar cambios en las direcciones del cliente
        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${customerId}` },
            handleChanges
        );

        // --- 👇 AÑADIDO: Escuchar cambios en el PROPIO registro del cliente ---
        channel.on(
            'postgres_changes',
            {
                event: 'UPDATE', // Escuchar solo actualizaciones
                schema: 'public',
                table: 'customers',
                filter: `id=eq.${customerId}` // Filtrar solo para este cliente
            },
            (payload) => {
                // Opcional: Podrías hacer una actualización más fina aquí
                // si solo cambian campos específicos como referral_count,
                // pero llamar a handleChanges es más simple y seguro.
                console.log('[UserDataContext] Cambio detectado en tabla customers:', payload);
                handleChanges(payload); // Reutilizar el handler general
            }
        );
        // --- FIN AÑADIDO ---

        // Suscribirse al canal
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[UserDataContext] Suscrito a cambios para cliente: ${customerId}`);
          }
           if (status === 'CHANNEL_ERROR') {
             console.error(`[UserDataContext] Error en canal para cliente ${customerId}`);
           }
            if (status === 'TIMED_OUT') {
             console.warn(`[UserDataContext] Timeout en canal para cliente ${customerId}`);
           }
        });

        // Limpieza al desmontar o cambiar de cliente
        return () => {
            console.log(`[UserDataContext] Desuscribiendo listeners para cliente: ${customerId}`);
            supabase.removeChannel(channel);
        };

    // Reactivar si el ID del cliente cambia (ej. cierra sesión y vuelve a entrar)
    // O si cambia el 'phone' (que dispara el refetch inicial y puede cambiar el customerId)
    // O si 'fetchAndCacheUserData' cambia (aunque debería ser estable con useCallback)
    }, [userData.customer?.id, phone, fetchAndCacheUserData, INFO_CACHE_KEY, ORDERS_CACHE_KEY]);

    // Valor del contexto (sin cambios)
    const value = { ...userData, loading, error, refetch: () => fetchAndCacheUserData(phone) };

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
};