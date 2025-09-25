// src/context/ProductExtrasContext.jsx (MODIFICADO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

const FAVORITES_CACHE_KEY = 'ea-favorites-cache';

export const ProductExtrasProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [reviews, setReviews] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchAndCacheExtras = useCallback(async (currentCustomerId) => {
        setLoading(true);
        try {
            // --- 👇 AQUÍ ESTÁ EL CAMBIO ---
            // Ahora pedimos más datos del producto asociado a la reseña.
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id, name, image_url, is_active), customers(name)')
                .order('created_at', { ascending: false });
            // --- 👆 FIN DEL CAMBIO ---
            setReviews(revData || []);

            if (currentCustomerId) {
                const { data: favData } = await supabase
                    .from('customer_favorites')
                    .select('*, products(id, name, image_url, is_active)')
                    .eq('customer_id', currentCustomerId);
                
                const validFavorites = favData || [];
                setFavorites(validFavorites);
                localStorage.setItem(FAVORITES_CACHE_KEY, JSON.stringify(validFavorites));
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
                fetchAndCacheExtras(null);
                return;
            }
            const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
            const currentId = data ? data.id : null;
            setCustomerId(currentId);
            const cachedFavs = localStorage.getItem(FAVORITES_CACHE_KEY);
            if (cachedFavs) {
                setFavorites(JSON.parse(cachedFavs));
            }
            fetchAndCacheExtras(currentId);
        };
        getCustomerIdAndFetch();
    }, [phone, fetchAndCacheExtras]);

    useEffect(() => {
        const handleChanges = (payload, table) => {
            console.log(`Real-time change in ${table}:`, payload);
            if (customerId) {
                fetchAndCacheExtras(customerId);
            }
        };

        const channel = supabase.channel('product-extras');

        channel
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'product_reviews' },
                (payload) => handleChanges(payload, 'product_reviews')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'customer_favorites' },
                (payload) => handleChanges(payload, 'customer_favorites')
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Conectado al canal de extras en tiempo real.');
                }
                if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Error en el canal de tiempo real:', err);
                }
                 if (status === 'TIMED_OUT') {
                    console.warn('⌛ La conexión de tiempo real expiró. Intentando reconectar...');
                }
            });

        return () => {
            console.log('Desuscribiendo del canal de extras.');
            supabase.removeChannel(channel);
        };
    }, [customerId, fetchAndCacheExtras]);

    const value = {
        reviews,
        favorites,
        customerId,
        loading,
        refetch: () => customerId && fetchAndCacheExtras(customerId)
    };

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
};