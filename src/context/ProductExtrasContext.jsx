import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';
import { useSettings } from './SettingsContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { subscribeToStoreBroadcast } from '../lib/broadcastRealtime';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

export const ProductExtrasProvider = ({ children }) => {
    const { isMaintenanceMode } = useSettings();
    const { customer: canonicalCustomer } = useCustomer();
    const effectiveCustomerId = canonicalCustomer?.id || null;

    // Inicialización síncrona desde caché para evitar spinner si ya hay datos
    const [allReviews, setAllReviews] = useState(() => {
        try {
            const cached = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
            return Array.isArray(cached?.data) ? cached.data : [];
        } catch {
            return [];
        }
    });

    const [favorites, setFavorites] = useState(() => {
        if (!effectiveCustomerId) return [];
        try {
            const cached = getCache(`${CACHE_KEYS.FAVORITES}-${effectiveCustomerId}`, CACHE_TTL.PRODUCT_EXTRAS);
            return Array.isArray(cached?.data) ? cached.data : [];
        } catch {
            return [];
        }
    });

    const [customerId, setCustomerId] = useState(effectiveCustomerId);
    const [loading, setLoading] = useState(() => {
        try {
            const cachedRevs = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
            if (effectiveCustomerId) {
                const cachedFavs = getCache(`${CACHE_KEYS.FAVORITES}-${effectiveCustomerId}`, CACHE_TTL.PRODUCT_EXTRAS);
                return !cachedRevs?.data || !cachedFavs?.data;
            }
            return !cachedRevs?.data;
        } catch {
            return false;
        }
    });

    // --- FUNCIÓN PRINCIPAL DE FETCH Y CACHÉ ---
    const fetchAndCacheExtras = useCallback(async (currentCustomerId, options = {}) => {
        if (isMaintenanceMode) return;
        const { background = false } = options;

        if (!background) {
            setLoading(true);
        }
        try {
            // 1. Las reseñas se obtienen para carga inicial/refetch completo.
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id, name, slug, image_url, is_active, price), customers(name)')
                .order('created_at', { ascending: false });

            const validReviews = revData || [];
            setAllReviews(validReviews);
            setCache(CACHE_KEYS.REVIEWS, validReviews);

            // 2. Los favoritos
            if (currentCustomerId) {
                const favoritesCacheKey = `${CACHE_KEYS.FAVORITES}-${currentCustomerId}`;
                const { data: favData } = await supabase
                    .from('customer_favorites')
                    .select('*, products(id, name, slug, image_url, is_active, price)')
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
    }, [isMaintenanceMode]);

    // --- useEffect para CARGA INICIAL CON STALE-WHILE-REVALIDATE ---
    useEffect(() => {
        if (isMaintenanceMode) {
            setLoading(false);
            return undefined;
        }

        let cancelled = false;

        const initializeAndFetch = async () => {
            const currentId = effectiveCustomerId;
            if (cancelled) return;
            setCustomerId(currentId);

            let shouldRevalidate = false;
            let hasCachedData = false;

            if (currentId) {
                const favoritesCacheKey = `${CACHE_KEYS.FAVORITES}-${currentId}`;
                const { data: cachedFavs, isStale } = getCache(favoritesCacheKey, CACHE_TTL.PRODUCT_EXTRAS);
                if (cancelled) return;
                if (cachedFavs) {
                    setFavorites(cachedFavs);
                    hasCachedData = true;
                }
                if (isStale || !cachedFavs) shouldRevalidate = true;
            } else {
                setFavorites([]);
            }

            const { data: cachedRevs, isStale } = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
            if (cancelled) return;
            if (cachedRevs) {
                setAllReviews(cachedRevs);
                hasCachedData = true;
            }
            if (isStale || !cachedRevs) shouldRevalidate = true;

            // Si ya hay datos en caché, no bloqueamos la UI con loading
            if (!hasCachedData && shouldRevalidate) {
                setLoading(true);
            }

            if (shouldRevalidate) {
                await fetchAndCacheExtras(currentId, { background: hasCachedData });
            } else if (!cancelled) {
                setLoading(false);
            }
        };

        initializeAndFetch();
        return () => {
            cancelled = true;
        };
    }, [effectiveCustomerId, fetchAndCacheExtras, isMaintenanceMode]);

    // --- useEffect para REALTIME CON ACTUALIZACIÓN INCREMENTAL Y BROADCAST ---
    useEffect(() => {
        if (isMaintenanceMode) return undefined;

        const handleChanges = (payload) => {
            if (payload.table === 'product_reviews') {
                const { eventType, new: newRecord, old: oldRecord } = payload;

                const fetchReviewWithRelations = async (reviewId) => {
                    const { data, error } = await supabase
                        .from('product_reviews')
                        .select('*, products(id, name, slug, image_url, is_active, price), customers(name)')
                        .eq('id', reviewId)
                        .maybeSingle();
                    if (error) {
                        console.error("Error fetching related data for review:", error);
                        return null;
                    }
                    return data;
                };

                if (eventType === 'INSERT') {
                    fetchReviewWithRelations(newRecord.id).then(fullNewRecord => {
                        if (fullNewRecord) {
                            setAllReviews(prev => {
                                if (prev.some(r => r.id === fullNewRecord.id)) return prev;
                                const updatedReviews = [fullNewRecord, ...prev];
                                setCache(CACHE_KEYS.REVIEWS, updatedReviews);
                                return updatedReviews;
                            });
                        }
                    });
                } else if (eventType === 'UPDATE') {
                    fetchReviewWithRelations(newRecord.id).then(fullUpdatedRecord => {
                        if (fullUpdatedRecord) {
                            setAllReviews(prev => {
                                const updatedReviews = prev.map(r =>
                                    r.id === fullUpdatedRecord.id ? fullUpdatedRecord : r
                                );
                                setCache(CACHE_KEYS.REVIEWS, updatedReviews);
                                return updatedReviews;
                            });
                        }
                    });
                } else if (eventType === 'DELETE') {
                    const deletedId = oldRecord.id;
                    setAllReviews(prev => {
                        const updatedReviews = prev.filter(r => r.id !== deletedId);
                        setCache(CACHE_KEYS.REVIEWS, updatedReviews);
                        return updatedReviews;
                    });
                }
            } else if (payload.table === 'customer_favorites') {
                const customerIdAffected = payload.new?.customer_id || payload.old?.customer_id;
                if (customerIdAffected === customerId) {
                    fetchAndCacheExtras(customerId, { background: true });
                }
            }
        };

        const channelName = customerId ? `product-extras-${customerId}` : 'product-extras-global';
        const channel = supabase.channel(channelName);
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, handleChanges);
        if (customerId) {
            channel.on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'customer_favorites',
                filter: `customer_id=eq.${customerId}`
            }, handleChanges);
        }
        channel.subscribe();

        const unsubReviewsBroadcast = subscribeToStoreBroadcast('reviews_updated', () => {
            fetchAndCacheExtras(customerId, { background: true });
        });

        const unsubFavoritesBroadcast = subscribeToStoreBroadcast('favorites_updated', (data) => {
            if (!data?.customerId || data.customerId === customerId) {
                fetchAndCacheExtras(customerId, { background: true });
            }
        });

        return () => {
            supabase.removeChannel(channel);
            if (unsubReviewsBroadcast) unsubReviewsBroadcast();
            if (unsubFavoritesBroadcast) unsubFavoritesBroadcast();
        };
    }, [customerId, fetchAndCacheExtras, isMaintenanceMode]);

    const myReviews = useMemo(() => {
        if (!customerId) return [];
        return allReviews.filter(review => review.customer_id === customerId);
    }, [allReviews, customerId]);

    const refetch = useCallback(() => fetchAndCacheExtras(customerId, { background: true }), [customerId, fetchAndCacheExtras]);

    const value = useMemo(() => ({
        reviews: allReviews,
        myReviews,
        favorites,
        customerId,
        loading,
        refetch,
    }), [allReviews, customerId, favorites, loading, myReviews, refetch]);

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
};
