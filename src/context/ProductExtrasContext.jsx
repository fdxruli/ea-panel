// src/context/ProductExtrasContext.jsx (CORREGIDO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

// Ya no guardaremos las reseñas en caché local, ya que pueden ser muchas.
const FAVORITES_CACHE_KEY = 'ea-favorites-cache';

export const ProductExtrasProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [reviews, setReviews] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [loading, setLoading] = useState(true);

    // --- 👇 FUNCIÓN MODIFICADA ---
    const fetchAndCacheExtras = useCallback(async (currentCustomerId) => {
        setLoading(true);
        try {
            // 1. Obtenemos TODAS las reseñas.
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id), customers(name)') // Pedimos el nombre del cliente
                .order('created_at', { ascending: false });

            setReviews(revData || []);

            // 2. Obtenemos solo los favoritos del usuario actual (si existe).
            if (currentCustomerId) {
                const { data: favData } = await supabase
                    .from('customer_favorites')
                    .select('*, products(id, name, image_url, is_active)')
                    .eq('customer_id', currentCustomerId);

                setFavorites(favData || []);
                localStorage.setItem(FAVORITES_CACHE_KEY, JSON.stringify(favData || []));
            } else {
                setFavorites([]);
                localStorage.removeItem(FAVORITES_CACHE_KEY);
            }
        } catch (error) {
            console.error("Error fetching extras:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const getCustomerIdAndFetch = async () => {
            if (!phone) {
                setCustomerId(null);
                setFavorites([]);
                // Aunque no haya sesión, igual queremos ver las reseñas públicas.
                fetchAndCacheExtras(null);
                return;
            }

            const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
            const currentId = data ? data.id : null;
            setCustomerId(currentId);
            
            // Cargamos favoritos de la caché para una carga inicial rápida.
            const cachedFavs = localStorage.getItem(FAVORITES_CACHE_KEY);
            if (cachedFavs) {
                setFavorites(JSON.parse(cachedFavs));
            }

            // Siempre buscamos datos frescos.
            fetchAndCacheExtras(currentId);
        };
        getCustomerIdAndFetch();
    }, [phone, fetchAndCacheExtras]);

    // ... (El useEffect para las suscripciones en tiempo real se mantiene igual)
    useEffect(() => {
        if (!customerId) return;
        const channel = supabase.channel(`customer-extras-${customerId}`);

        const handleChanges = (payload) => {
             console.log(`Real-time change detected in ${payload.table}, refetching extras...`);
             fetchAndCacheExtras(customerId);
        };

        channel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews', filter: `customer_id=eq.${customerId}` }, handleChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` }, handleChanges)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [customerId, fetchAndCacheExtras]);

    const value = { 
        reviews, 
        favorites, 
        customerId, 
        loading, 
        refetch: () => fetchAndCacheExtras(customerId) 
    };

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
};