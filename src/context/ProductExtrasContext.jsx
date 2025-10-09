import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

const FAVORITES_CACHE_KEY = 'ea-favorites-cache';
const REVIEWS_CACHE_KEY = 'ea-reviews-cache';

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
            localStorage.setItem(REVIEWS_CACHE_KEY, JSON.stringify(validReviews));

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
        setLoading(true);
        try {
            const cachedFavs = localStorage.getItem(FAVORITES_CACHE_KEY);
            if (cachedFavs) setFavorites(JSON.parse(cachedFavs));
            const cachedRevs = localStorage.getItem(REVIEWS_CACHE_KEY);
            if (cachedRevs) setReviews(JSON.parse(cachedRevs));
        } catch(e) {
            console.error("Error al leer caché de extras", e);
        }

        const getCustomerIdAndFetch = async () => {
            if (!phone) {
                setCustomerId(null);
                setLoading(false);
                return;
            }
            const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
            const currentId = data ? data.id : null;
            setCustomerId(currentId);
            fetchAndCacheExtras(currentId);
        };

        getCustomerIdAndFetch();
    }, [phone, fetchAndCacheExtras]);

    useEffect(() => {
        const handleFavoriteChanges = (payload) => {
            console.log('Cambio en Favoritos:', payload);
            setFavorites(prevFavs => {
                if (payload.eventType === 'INSERT') {
                    return [...prevFavs, payload.new];
                }
                if (payload.eventType === 'DELETE') {
                    return prevFavs.filter(fav => fav.id !== payload.old.id);
                }
                return prevFavs;
            });
        };
        
        const handleReviewChanges = (payload) => {
            console.log('Cambio en Reseñas:', payload);
            setReviews(prevRevs => {
                if (payload.eventType === 'INSERT') {
                    return [payload.new, ...prevRevs];
                }
                if (payload.eventType === 'UPDATE') {
                    return prevRevs.map(rev => rev.id === payload.new.id ? payload.new : rev);
                }
                if (payload.eventType === 'DELETE') {
                    return prevRevs.filter(rev => rev.id !== payload.old.id);
                }
                return prevRevs;
            });
        };

        const channel = supabase.channel('product-extras-granular');
        
        if (customerId) {
            channel.on('postgres_changes', { 
                event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` 
            }, handleFavoriteChanges);
        }
        
        channel.on('postgres_changes', { 
            event: '*', schema: 'public', table: 'product_reviews' 
        }, handleReviewChanges);

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [customerId]);

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