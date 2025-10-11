import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

export const ProductExtrasProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [reviews, setReviews] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchAndCacheExtras = useCallback(async (currentCustomerId) => {
        try {
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id, name, image_url, is_active), customers(name)')
                .order('created_at', { ascending: false });
            
            const validReviews = revData || [];
            setReviews(validReviews);
            setCache(CACHE_KEYS.REVIEWS, validReviews);

            if (currentCustomerId) {
                const favoritesCacheKey = `${CACHE_KEYS.FAVORITES}-${currentCustomerId}`;
                const { data: favData } = await supabase
                    .from('customer_favorites')
                    .select('*, products(id, name, image_url, is_active)')
                    .eq('customer_id', currentCustomerId);
                
                const validFavorites = favData || [];
                setFavorites(validFavorites);
                setCache(favoritesCacheKey, validFavorites);
            } else {
                setFavorites([]);
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
                setLoading(false);
                return;
            }

            // Obtenemos el ID del cliente primero
            const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
            const currentId = data ? data.id : null;
            setCustomerId(currentId);

            // Cargamos reseñas desde caché/revalidamos
            const { data: cachedRevs, isStale: isRevsStale } = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
            if (cachedRevs) {
                setReviews(cachedRevs);
                setLoading(false);
            }
            
            // Cargamos favoritos desde caché/revalidamos (si hay cliente)
            if (currentId) {
                const favoritesCacheKey = `${CACHE_KEYS.FAVORITES}-${currentId}`;
                const { data: cachedFavs, isStale: isFavsStale } = getCache(favoritesCacheKey, CACHE_TTL.PRODUCT_EXTRAS);
                 if (cachedFavs) {
                    setFavorites(cachedFavs);
                 }
                 // Revalidamos si cualquiera de los dos cachés está "stale" o no existe
                 if (isRevsStale || isFavsStale) {
                    fetchAndCacheExtras(currentId);
                 }
            } else if (isRevsStale) { // Si no hay cliente, solo revalidamos reseñas
                 fetchAndCacheExtras(null);
            }
        };

        getCustomerIdAndFetch();
    }, [phone, fetchAndCacheExtras]);

    useEffect(() => {
        const handleChanges = () => {
            console.log('Cambio detectado en extras, revalidando...');
            if (customerId) {
                fetchAndCacheExtras(customerId);
            }
        };

        const channel = supabase.channel('product-extras-granular');
        
        // La suscripción fuerza una recarga de datos, invalidando el caché
        if (customerId) {
            channel.on('postgres_changes', { 
                event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` 
            }, handleChanges);
        }
        
        channel.on('postgres_changes', { 
            event: '*', schema: 'public', table: 'product_reviews' 
        }, handleChanges);

        channel.subscribe();

        return () => {
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