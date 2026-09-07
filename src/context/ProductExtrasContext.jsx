// src/context/ProductExtrasContext.jsx
import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';

const ProductExtrasContext = createContext();
export const useProductExtras = () => useContext(ProductExtrasContext);

export const ProductExtrasProvider = ({ children }) => {
    const { customerId, isAuthenticated, isLinked, isCustomerLoading } = useCustomer();
    const { pathname } = useLocation();
    const extrasEnabled = pathname === '/mi-actividad' || pathname.startsWith('/producto/');
    const extrasEnabledRef = useRef(extrasEnabled);
    extrasEnabledRef.current = extrasEnabled;
    const [allReviews, setAllReviews] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(true);
    const requestIdRef = useRef(0);

    const fetchAndCacheExtras = useCallback(async (currentCustomerId) => {
        if (!extrasEnabledRef.current) return;
        const requestId = ++requestIdRef.current;
        setLoading(true);
        try {
            const { data: revData, error: revError } = await supabase
                .from('product_reviews')
                .select('*, products(id, name, image_url, is_active), customers(name)')
                .order('created_at', { ascending: false });
            if (revError) throw revError;
            if (requestId !== requestIdRef.current || !extrasEnabledRef.current) return;
            setAllReviews(revData || []);
            setCache(CACHE_KEYS.REVIEWS, revData || []);

            if (currentCustomerId && isAuthenticated && isLinked) {
                const favoritesCacheKey = `${CACHE_KEYS.FAVORITES}-${currentCustomerId}`;
                const { data: favData, error: favError } = await supabase
                    .from('customer_favorites')
                    .select('*, products(id, name, image_url, is_active)')
                    .eq('customer_id', currentCustomerId);
                if (favError) throw favError;
                if (requestId !== requestIdRef.current || !extrasEnabledRef.current) return;
                const validFavorites = favData || [];
                setFavorites(validFavorites);
                setCache(favoritesCacheKey, validFavorites);
            } else {
                setFavorites([]);
            }
        } catch (error) {
            if (requestId === requestIdRef.current) console.error('[ProductExtrasContext] Error fetching extras:', error);
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [isAuthenticated, isLinked]);

    useEffect(() => {
        if (!extrasEnabled) {
            requestIdRef.current += 1;
            setAllReviews([]); setFavorites([]); setLoading(false);
            return undefined;
        }
        if (isCustomerLoading) {
            setLoading(true);
            return undefined;
        }
        let cancelled = false;
        const initialize = async () => {
            setLoading(true);
            let shouldRevalidate = false;
            if (customerId && isAuthenticated && isLinked) {
                const favoritesCacheKey = `${CACHE_KEYS.FAVORITES}-${customerId}`;
                const { data: cachedFavs, isStale } = getCache(favoritesCacheKey, CACHE_TTL.PRODUCT_EXTRAS);
                if (cancelled) return;
                if (cachedFavs) setFavorites(cachedFavs);
                if (isStale || !cachedFavs) shouldRevalidate = true;
            } else {
                setFavorites([]);
            }
            const { data: cachedRevs, isStale: revsStale } = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
            if (cancelled) return;
            if (cachedRevs) setAllReviews(cachedRevs);
            if (revsStale || !cachedRevs) shouldRevalidate = true;
            if (shouldRevalidate) await fetchAndCacheExtras(customerId);
            else if (!cancelled) setLoading(false);
        };
        initialize();
        return () => { cancelled = true; requestIdRef.current += 1; };
    }, [customerId, extrasEnabled, fetchAndCacheExtras, isAuthenticated, isCustomerLoading, isLinked]);

    useEffect(() => {
        if (!extrasEnabled || !isAuthenticated || !isLinked || !customerId) return undefined;
        const handleChanges = (payload) => {
            const affectedCustomerId = payload.new?.customer_id || payload.old?.customer_id;
            if (payload.table === 'customer_favorites' && affectedCustomerId !== customerId) return;
            fetchAndCacheExtras(customerId);
        };
        const channel = supabase.channel(`product-extras:${customerId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, handleChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` }, handleChanges)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [customerId, extrasEnabled, fetchAndCacheExtras, isAuthenticated, isLinked]);

    const myReviews = useMemo(() => customerId ? allReviews.filter(review => review.customer_id === customerId) : [], [allReviews, customerId]);
    const refetch = useCallback(() => fetchAndCacheExtras(customerId), [customerId, fetchAndCacheExtras]);

    const value = useMemo(() => ({ reviews: allReviews, myReviews, favorites, customerId: customerId || null, loading, refetch }), [allReviews, customerId, favorites, loading, myReviews, refetch]);
    return <ProductExtrasContext.Provider value={value}>{children}</ProductExtrasContext.Provider>;
};
