// src/context/ProductExtrasContext.jsx (CORREGIDO)

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
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id), customers(name)')
                .order('created_at', { ascending: false });
            setReviews(revData || []);

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

    // --- 👇 AQUÍ ESTÁ EL CAMBIO PRINCIPAL ---
    useEffect(() => {
        const handleReviewChange = (payload) => {
            console.log(`Real-time change detected in reviews, refetching...`);
            // Volvemos a cargar todo para obtener la nueva reseña
            fetchAndCacheExtras(customerId);
        };

        // 1. Creamos un canal PÚBLICO solo para las reseñas.
        const reviewsChannel = supabase.channel('public-reviews');
        reviewsChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, handleReviewChange)
            .subscribe();

        // 2. Mantenemos el canal PRIVADO para los favoritos del usuario.
        let favoritesChannel;
        if (customerId) {
            const handleFavoriteChange = (payload) => {
                console.log(`Real-time change detected in favorites for user ${customerId}, refetching...`);
                fetchAndCacheExtras(customerId);
            };
            favoritesChannel = supabase.channel(`customer-favorites-${customerId}`);
            favoritesChannel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` }, handleFavoriteChange)
                .subscribe();
        }

        // 3. Nos desuscribimos de ambos canales al desmontar.
        return () => {
            supabase.removeChannel(reviewsChannel);
            if (favoritesChannel) {
                supabase.removeChannel(favoritesChannel);
            }
        };
    }, [customerId, fetchAndCacheExtras]);
    // --- 👆 FIN DEL CAMBIO ---

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
