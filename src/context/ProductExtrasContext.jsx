<<<<<<< HEAD
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
        setLoading(true);
        try {
            // 1. Las reseñas son públicas, siempre se obtienen.
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id, name, image_url, is_active), customers(name)')
                .order('created_at', { ascending: false });
            
            const validReviews = revData || [];
            setReviews(validReviews);
            setCache(CACHE_KEYS.REVIEWS, validReviews);

            // 2. Los favoritos son privados, solo se obtienen si hay un cliente.
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
                setFavorites([]); // Si no hay cliente, los favoritos están vacíos.
            }
        } catch (error) {
            console.error("Error fetching extras:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const initializeAndFetch = async () => {
            setLoading(true);
            let currentId = null;
            let shouldRevalidate = false;

            // --- Lógica para datos del usuario ---
            if (phone) {
                const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
                currentId = data ? data.id : null;
                setCustomerId(currentId);
                
                if (currentId) {
                    const favoritesCacheKey = `${CACHE_KEYS.FAVORITES}-${currentId}`;
                    const { data: cachedFavs, isStale } = getCache(favoritesCacheKey, CACHE_TTL.PRODUCT_EXTRAS);
                    if (cachedFavs) setFavorites(cachedFavs);
                    if (isStale || !cachedFavs) shouldRevalidate = true;
                }
            } else {
                setCustomerId(null);
                setFavorites([]);
            }
            
            // --- Lógica para datos públicos (reseñas) ---
            const { data: cachedRevs, isStale } = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
            if (cachedRevs) setReviews(cachedRevs);
            if (isStale || !cachedRevs) shouldRevalidate = true;

            // --- Decisión final ---
            if (shouldRevalidate) {
                await fetchAndCacheExtras(currentId);
            } else {
                setLoading(false);
            }
        };

        initializeAndFetch();
    }, [phone, fetchAndCacheExtras]);

    useEffect(() => {
        const handleChanges = () => {
            console.log('Cambio detectado en extras, revalidando...');
            fetchAndCacheExtras(customerId);
        };

        const channel = supabase.channel('product-extras-listener');
        
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, handleChanges);
        
        if (customerId) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` }, handleChanges);
        }

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
        refetch: () => fetchAndCacheExtras(customerId)
    };

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
=======
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
        setLoading(true);
        try {
            // 1. Las reseñas son públicas, siempre se obtienen.
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id, name, image_url, is_active), customers(name)')
                .order('created_at', { ascending: false });
            
            const validReviews = revData || [];
            setReviews(validReviews);
            setCache(CACHE_KEYS.REVIEWS, validReviews);

            // 2. Los favoritos son privados, solo se obtienen si hay un cliente.
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
                setFavorites([]); // Si no hay cliente, los favoritos están vacíos.
            }
        } catch (error) {
            console.error("Error fetching extras:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const initializeAndFetch = async () => {
            setLoading(true);
            let currentId = null;
            let shouldRevalidate = false;

            // --- Lógica para datos del usuario ---
            if (phone) {
                const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
                currentId = data ? data.id : null;
                setCustomerId(currentId);
                
                if (currentId) {
                    const favoritesCacheKey = `${CACHE_KEYS.FAVORITES}-${currentId}`;
                    const { data: cachedFavs, isStale } = getCache(favoritesCacheKey, CACHE_TTL.PRODUCT_EXTRAS);
                    if (cachedFavs) setFavorites(cachedFavs);
                    if (isStale || !cachedFavs) shouldRevalidate = true;
                }
            } else {
                setCustomerId(null);
                setFavorites([]);
            }
            
            // --- Lógica para datos públicos (reseñas) ---
            const { data: cachedRevs, isStale } = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
            if (cachedRevs) setReviews(cachedRevs);
            if (isStale || !cachedRevs) shouldRevalidate = true;

            // --- Decisión final ---
            if (shouldRevalidate) {
                await fetchAndCacheExtras(currentId);
            } else {
                setLoading(false);
            }
        };

        initializeAndFetch();
    }, [phone, fetchAndCacheExtras]);

    useEffect(() => {
        const handleChanges = () => {
            console.log('Cambio detectado en extras, revalidando...');
            fetchAndCacheExtras(customerId);
        };

        const channel = supabase.channel('product-extras-listener');
        
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, handleChanges);
        
        if (customerId) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` }, handleChanges);
        }

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
        refetch: () => fetchAndCacheExtras(customerId)
    };

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
};