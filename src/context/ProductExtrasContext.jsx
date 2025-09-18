// src/context/ProductExtrasContext.jsx

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

const EXTRAS_CACHE_KEY = 'ea-extras-cache';

export const ProductExtrasProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [reviews, setReviews] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchAndCacheExtras = useCallback(async (currentCustomerId) => {
        if (!currentCustomerId) {
            setReviews([]);
            setFavorites([]);
            localStorage.removeItem(EXTRAS_CACHE_KEY);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data: favData } = await supabase
                .from('customer_favorites').select('*, products(id, name, image_url, is_active)')
                .eq('customer_id', currentCustomerId);

            const { data: revData } = await supabase
                .from('product_reviews').select('*, products(id, name, image_url, is_active)')
                .eq('customer_id', currentCustomerId);

            setFavorites(favData || []);
            setReviews(revData || []);
            localStorage.setItem(EXTRAS_CACHE_KEY, JSON.stringify({ favorites: favData || [], reviews: revData || [] }));
        } catch (error) {
            console.error("Error fetching extras:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const getCustomerId = async () => {
            if (phone) {
                const { data } = await supabase.from('customers').select('id').eq('phone', phone).single();
                if (data) {
                    setCustomerId(data.id);
                    const cachedData = localStorage.getItem(EXTRAS_CACHE_KEY);
                    if (cachedData) {
                        const {favorites: cachedFav, reviews: cachedRev} = JSON.parse(cachedData);
                        setFavorites(cachedFav || []);
                        setReviews(cachedRev || []);
                        setLoading(false);
                    }
                    fetchAndCacheExtras(data.id);
                } else {
                    setCustomerId(null);
                }
            } else {
                setCustomerId(null);
            }
        };
        getCustomerId();
    }, [phone, fetchAndCacheExtras]);


    useEffect(() => {
        if (!customerId) return;
        const channel = supabase.channel(`customer-extras-${customerId}`);

        const reviewsSubscription = {
            table: 'product_reviews',
            schema: 'public',
            filter: `customer_id=eq.${customerId}`
        };
        const favoritesSubscription = {
            table: 'customer_favorites',
            schema: 'public',
            filter: `customer_id=eq.${customerId}`
        };

        channel
            .on('postgres_changes', { event: '*', ...reviewsSubscription }, payload => {
                console.log('Real-time change in reviews:', payload);
                fetchAndCacheExtras(customerId);
            })
            .on('postgres_changes', { event: '*', ...favoritesSubscription }, payload => {
                console.log('Real-time change in favorites:', payload);
                fetchAndCacheExtras(customerId);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [customerId, fetchAndCacheExtras]);


    const value = { reviews, favorites, customerId, loading, refetch: () => fetchAndCacheExtras(customerId) };

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
};