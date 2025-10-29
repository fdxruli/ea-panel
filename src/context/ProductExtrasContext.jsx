// src/context/ProductExtrasContext.jsx
import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

export const ProductExtrasProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [allReviews, setAllReviews] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [loading, setLoading] = useState(true);

    // --- FUNCIÓN PRINCIPAL DE FETCH Y CACHÉ (SIN CAMBIOS SIGNIFICATIVOS) ---
    // fetchAndCacheExtras todavía se necesita para la carga inicial y para los favoritos.
    const fetchAndCacheExtras = useCallback(async (currentCustomerId) => {
        setLoading(true);
        try {
            // 1. Las reseñas se obtienen para carga inicial/refetch completo.
            const { data: revData } = await supabase
                .from('product_reviews')
                .select('*, products(id, name, image_url, is_active), customers(name)')
                .order('created_at', { ascending: false });

            const validReviews = revData || [];
            setAllReviews(validReviews);
            setCache(CACHE_KEYS.REVIEWS, validReviews);

            // 2. Los favoritos (sin cambios en su lógica de fetch).
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
    }, []); // Dependencias estables

    // --- useEffect para CARGA INICIAL (SIN CAMBIOS) ---
    useEffect(() => {
        const initializeAndFetch = async () => {
            setLoading(true);
            let currentId = null;
            let shouldRevalidate = false;

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

            const { data: cachedRevs, isStale } = getCache(CACHE_KEYS.REVIEWS, CACHE_TTL.PRODUCT_EXTRAS);
            if (cachedRevs) setAllReviews(cachedRevs);
            if (isStale || !cachedRevs) shouldRevalidate = true;

            if (shouldRevalidate) {
                await fetchAndCacheExtras(currentId);
            } else {
                setLoading(false);
            }
        };

        initializeAndFetch();
    }, [phone, fetchAndCacheExtras]);

    // --- 👇 useEffect para REALTIME CON ACTUALIZACIÓN INCREMENTAL ---
    useEffect(() => {
        const handleChanges = (payload) => {
            console.log('Cambio detectado en extras, actualizando...', payload);

            // --- ✅ Lógica Incremental para Reseñas ---
            if (payload.table === 'product_reviews') {
                const { eventType, new: newRecord, old: oldRecord } = payload;

                // **IMPORTANTE**: Necesitas fetchear los datos relacionados (products, customers)
                // para la nueva reseña insertada o actualizada, ya que el payload no los incluye.
                // Usaremos una función auxiliar para esto.
                const fetchReviewWithRelations = async (reviewId) => {
                    const { data, error } = await supabase
                        .from('product_reviews')
                        .select('*, products(id, name, image_url, is_active), customers(name)')
                        .eq('id', reviewId)
                        .maybeSingle(); // Usar maybeSingle por si se elimina justo antes
                    if (error) {
                        console.error("Error fetching related data for review:", error);
                        return null; // Devolver null si falla
                    }
                    return data;
                };


                if (eventType === 'INSERT') {
                    console.log('Insertando nueva reseña...');
                    fetchReviewWithRelations(newRecord.id).then(fullNewRecord => {
                        if (fullNewRecord) {
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
                     console.log('Actualizando reseña existente...');
                    fetchReviewWithRelations(newRecord.id).then(fullUpdatedRecord => {
                         if (fullUpdatedRecord) {
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
                    console.log('Eliminando reseña...');
                    const deletedId = oldRecord.id;
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
                    console.log('Actualizando favoritos para el cliente actual...');
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

        return () => {
            supabase.removeChannel(channel);
        };
    // Quitamos fetchAndCacheExtras de las dependencias aquí, ya que no queremos
    // que este efecto se re-ejecute cada vez que esa función (estable) se redefine.
    // Solo depende de customerId para la lógica de favoritos.
    }, [customerId]);
    // --- FIN useEffect REALTIME ---

    // --- myReviews calculado con useMemo (sin cambios) ---
    const myReviews = useMemo(() => {
        if (!customerId) return [];
        console.log("Contexto: Recalculando myReviews...");
        return allReviews.filter(review => review.customer_id === customerId);
    }, [allReviews, customerId]);

    const value = {
        reviews: allReviews,
        myReviews,
        favorites,
        customerId,
        loading,
        refetch: () => fetchAndCacheExtras(customerId) // refetch sigue haciendo fetch completo
    };

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
};