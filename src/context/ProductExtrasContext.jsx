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

    // useCallback envuelve la lógica principal para evitar re-creaciones innecesarias.
    const fetchAndCacheExtras = useCallback(async (currentCustomerId) => {
        setLoading(true);
        try {
            // Obtiene todas las reseñas (son públicas)
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id), customers(name)')
                .order('created_at', { ascending: false });
            setReviews(revData || []);

            // Si hay un ID de cliente, busca sus favoritos.
            if (currentCustomerId) {
                const { data: favData } = await supabase
                    .from('customer_favorites')
                    .select('*, products(id, name, image_url, is_active)')
                    .eq('customer_id', currentCustomerId);
                
                const validFavorites = favData || [];
                setFavorites(validFavorites);
                // Almacena en caché los favoritos para una carga más rápida la próxima vez.
                localStorage.setItem(FAVORITES_CACHE_KEY, JSON.stringify(validFavorites));
            } else {
                // Si no hay cliente, limpia los favoritos.
                setFavorites([]);
                localStorage.removeItem(FAVORITES_CACHE_KEY);
            }
        } catch (error) {
            console.error("Error fetching extras:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Este useEffect ahora se encarga de obtener el ID del cliente CADA VEZ que el teléfono cambie.
    useEffect(() => {
        const getCustomerIdAndFetch = async () => {
            if (!phone) {
                setCustomerId(null);
                // Si no hay teléfono, llamamos a fetchAndCacheExtras con null para limpiar los favoritos.
                fetchAndCacheExtras(null);
                return;
            }

            // Busca el cliente en Supabase por su número de teléfono.
            const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
            const currentId = data ? data.id : null;
            
            setCustomerId(currentId);

            // Intenta cargar los favoritos desde la caché para una experiencia más fluida.
            const cachedFavs = localStorage.getItem(FAVORITES_CACHE_KEY);
            if (cachedFavs) {
                setFavorites(JSON.parse(cachedFavs));
            }

            // Llama a la función principal para obtener todos los datos actualizados (reseñas y favoritos).
            fetchAndCacheExtras(currentId);
        };

        getCustomerIdAndFetch();
    }, [phone, fetchAndCacheExtras]); // Se ejecuta cada vez que 'phone' o 'fetchAndCacheExtras' cambian.

    // Este useEffect gestiona las actualizaciones en tiempo real de Supabase.
    useEffect(() => {
        const handleReviewChange = () => {
            console.log(`Real-time change detected in reviews, refetching...`);
            fetchAndCacheExtras(customerId);
        };

        const reviewsChannel = supabase.channel('public-reviews');
        reviewsChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, handleReviewChange)
            .subscribe();

        let favoritesChannel;
        if (customerId) {
            const handleFavoriteChange = () => {
                console.log(`Real-time change detected in favorites for user ${customerId}, refetching...`);
                fetchAndCacheExtras(customerId);
            };
            favoritesChannel = supabase.channel(`customer-favorites-${customerId}`);
            favoritesChannel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` }, handleFavoriteChange)
                .subscribe();
        }

        return () => {
            supabase.removeChannel(reviewsChannel);
            if (favoritesChannel) {
                supabase.removeChannel(favoritesChannel);
            }
        };
    }, [customerId, fetchAndCacheExtras]);

    const value = {
        reviews,
        favorites,
        customerId, // La clave del problema: ahora este valor estará actualizado.
        loading,
        refetch: () => customerId && fetchAndCacheExtras(customerId)
    };

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
};