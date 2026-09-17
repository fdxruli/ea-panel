// src/context/ProductExtrasContext.jsx
import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { subscribeToStoreBroadcast } from '../lib/broadcastRealtime';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

export const ProductExtrasProvider = ({ children }) => {
    const { phone, customer: canonicalCustomer } = useCustomer();
    const effectiveCustomerId = canonicalCustomer?.id || null;
    const { pathname } = useLocation();
    const extrasEnabled = pathname === '/mi-actividad' || pathname.startsWith('/producto/');
    const extrasEnabledRef = useRef(extrasEnabled);
    extrasEnabledRef.current = extrasEnabled;

    // Inicialización síncrona desde caché para evitar spinner si ya hay datos
    const [allReviews, setAllReviews] = useState(() => {
        const cached = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
        return cached?.data || [];
    });
    const [favorites, setFavorites] = useState(() => {
        if (!effectiveCustomerId) return [];
        const cached = getCache(`${CACHE_KEYS.FAVORITES}-${effectiveCustomerId}`, CACHE_TTL.PRODUCT_EXTRAS);
        return cached?.data || [];
    });
    const [customerId, setCustomerId] = useState(effectiveCustomerId);
    const [loading, setLoading] = useState(() => {
        const cachedRevs = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
        if (effectiveCustomerId) {
            const cachedFavs = getCache(`${CACHE_KEYS.FAVORITES}-${effectiveCustomerId}`, CACHE_TTL.PRODUCT_EXTRAS);
            return !cachedRevs?.data || !cachedFavs?.data;
        }
        return !cachedRevs?.data;
    });

    // --- FUNCIÓN PRINCIPAL DE FETCH Y CACHÉ ---
    const fetchAndCacheExtras = useCallback(async (currentCustomerId, options = {}) => {
        if (!extrasEnabledRef.current) return;
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
            if (!extrasEnabledRef.current) return;
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
                if (!extrasEnabledRef.current) return;
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

    // --- useEffect para CARGA INICIAL CON STALE-WHILE-REVALIDATE ---
    useEffect(() => {
        if (!extrasEnabled) {
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
    }, [extrasEnabled, effectiveCustomerId, fetchAndCacheExtras]);

    // --- 👇 useEffect para REALTIME CON ACTUALIZACIÓN INCREMENTAL ---
    useEffect(() => {
        if (!extrasEnabled) return undefined;

        const handleChanges = (payload) => {
            // --- ✅ Lógica Incremental para Reseñas ---
            if (payload.table === 'product_reviews') {
                const { eventType, new: newRecord, old: oldRecord } = payload;

                // **IMPORTANTE**: Necesitas fetchear los datos relacionados (products, customers)
                // para la nueva reseña insertada o actualizada, ya que el payload no los incluye.
                // Usaremos una función auxiliar para esto.
                const fetchReviewWithRelations = async (reviewId) => {
                    const { data, error } = await supabase
                        .from('product_reviews')
                        .select('*, products(id, name, slug, image_url, is_active, price), customers(name)')
                        .eq('id', reviewId)
                        .maybeSingle(); // Usar maybeSingle por si se elimina justo antes
                    if (error) {
                        console.error("Error fetching related data for review:", error);
                        return null; // Devolver null si falla
                    }
                    return data;
                };


                if (eventType === 'INSERT') {
                    fetchReviewWithRelations(newRecord.id).then(fullNewRecord => {
                        if (fullNewRecord && extrasEnabledRef.current) {
                            setAllReviews(prev => {
                                // Evitar duplicados si la inserción llega muy rápido
                                if (prev.some(r => r.id === fullNewRecord.id)) {
                                    return prev;
                                }
                                const updatedReviews = [fullNewRecord, ...prev];
                                setCache(CACHE_KEYS.REVIEWS, updatedReviews); // Actualizar caché
                                return updatedReviews;
                            });
                        }
                    });

                } else if (eventType === 'UPDATE') {
                    fetchReviewWithRelations(newRecord.id).then(fullUpdatedRecord => {
                         if (fullUpdatedRecord && extrasEnabledRef.current) {
                            setAllReviews(prev => {
                                const updatedReviews = prev.map(r =>
                                    r.id === fullUpdatedRecord.id ? fullUpdatedRecord : r
                                );
                                setCache(CACHE_KEYS.REVIEWS, updatedReviews); // Actualizar caché
                                return updatedReviews;
                            });
                         }
                     });

                } else if (eventType === 'DELETE') {
                    const deletedId = oldRecord.id;
                    if (!extrasEnabledRef.current) return;
                    setAllReviews(prev => {
                        const updatedReviews = prev.filter(r => r.id !== deletedId);
                        setCache(CACHE_KEYS.REVIEWS, updatedReviews); // Actualizar caché
                        return updatedReviews;
                    });
                }
            }
            // --- Fin Lógica Incremental ---

            // --- Lógica para Favoritos (sin cambios, sigue usando refetch) ---
            else if (payload.table === 'customer_favorites') {
                // Solo re-fetchear favoritos si el cambio afecta al cliente actual
                // Usar fetchAndCacheExtras aquí es aceptable porque los favoritos son menos numerosos
                // y ya están filtrados por customerId en la consulta.
                const customerIdAffected = payload.new?.customer_id || payload.old?.customer_id;
                if (customerIdAffected === customerId) {
                    fetchAndCacheExtras(customerId);
                }
            }
        };

        const channel = supabase.channel('product-extras-listener');

        // Escuchar cambios en TODAS las reseñas
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, handleChanges);

        // Escuchar cambios en favoritos (filtrado en el handler)
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites' }, handleChanges);

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
    // La función es estable; el canal solo cambia de identidad al cambiar el cliente.
    }, [customerId, extrasEnabled, fetchAndCacheExtras]);
    // --- FIN useEffect REALTIME ---

    // --- myReviews calculado con useMemo (sin cambios) ---
    const myReviews = useMemo(() => {
        if (!customerId) return [];
        return allReviews.filter(review => review.customer_id === customerId);
    }, [allReviews, customerId]);

    const refetch = useCallback(() => fetchAndCacheExtras(customerId), [customerId, fetchAndCacheExtras]);

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
