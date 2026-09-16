import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';

export function useCustomerFavorites() {
    const { customer: canonicalCustomer, isAuthenticated } = useCustomer();
    const customerId = canonicalCustomer?.id || null;

    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fetchIdRef = useRef(0);

    const fetchFavorites = useCallback(async () => {
        if (!customerId || !isAuthenticated) {
            setFavorites([]);
            setLoading(false);
            return;
        }

        const currentFetchId = ++fetchIdRef.current;
        setLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase
                .from('customer_favorites')
                .select('product_id, products(*)')
                .eq('customer_id', customerId);

            if (fetchError) throw fetchError;

            if (currentFetchId === fetchIdRef.current) {
                setFavorites(data || []);
            }
        } catch (err) {
            if (currentFetchId === fetchIdRef.current) {
                setError(err.message || 'Error al cargar favoritos.');
            }
        } finally {
            if (currentFetchId === fetchIdRef.current) {
                setLoading(false);
            }
        }
    }, [customerId, isAuthenticated]);

    useEffect(() => {
        fetchFavorites();
    }, [fetchFavorites]);

    const toggleFavorite = useCallback(async (productId) => {
        if (!customerId || !productId) return;

        const isCurrentlyFav = favorites.some((f) => f.product_id === productId);
        // Optimistic update
        setFavorites((prev) =>
            isCurrentlyFav
                ? prev.filter((f) => f.product_id !== productId)
                : [...prev, { product_id: productId, customer_id: customerId }]
        );

        try {
            if (isCurrentlyFav) {
                const { error: delError } = await supabase
                    .from('customer_favorites')
                    .delete()
                    .eq('customer_id', customerId)
                    .eq('product_id', productId);
                if (delError) throw delError;
            } else {
                const { error: insError } = await supabase
                    .from('customer_favorites')
                    .insert({ customer_id: customerId, product_id: productId });
                if (insError) throw insError;
            }
        } catch (err) {
            console.error('[useCustomerFavorites] Error toggling favorite:', err);
            await fetchFavorites(); // Rollback to server truth
            throw err;
        }
    }, [customerId, favorites, fetchFavorites]);

    return {
        favorites,
        loading,
        error,
        refetch: fetchFavorites,
        toggleFavorite,
    };
}
