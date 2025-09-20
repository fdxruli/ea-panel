// src/context/ProductExtrasContext.jsx (SIMPLIFICADO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from './CustomerContext';

const ProductExtrasContext = createContext();

export const useProductExtras = () => useContext(ProductExtrasContext);

export const ProductExtrasProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [favorites, setFavorites] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [loading, setLoading] = useState(true);

    // Esta función ahora solo carga los favoritos del cliente
    const fetchFavorites = useCallback(async (currentCustomerId) => {
        if (!currentCustomerId) {
            setFavorites([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data: favData } = await supabase
                .from('customer_favorites')
                .select('*, products(id, name, image_url, is_active)')
                .eq('customer_id', currentCustomerId);
            setFavorites(favData || []);
        } catch (error) {
            console.error("Error fetching favorites:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const getCustomerIdAndFetch = async () => {
            if (!phone) {
                setCustomerId(null);
                fetchFavorites(null);
                return;
            }
            const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
            const currentId = data ? data.id : null;
            setCustomerId(currentId);
            fetchFavorites(currentId);
        };
        getCustomerIdAndFetch();
    }, [phone, fetchFavorites]);

    // La suscripción a cambios ahora es solo para los favoritos
    useEffect(() => {
        if (!customerId) return;

        const handleFavoriteChange = (payload) => {
            console.log(`Cambio en favoritos para ${customerId}, actualizando...`);
            fetchFavorites(customerId);
        };

        const favoritesChannel = supabase.channel(`customer-favorites-${customerId}`);
        favoritesChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites', filter: `customer_id=eq.${customerId}` }, handleFavoriteChange)
            .subscribe();

        return () => {
            supabase.removeChannel(favoritesChannel);
        };
    }, [customerId, fetchFavorites]);

    const value = {
        favorites,
        customerId,
        loading,
        refetch: () => fetchFavorites(customerId)
    };

    return (
        <ProductExtrasContext.Provider value={value}>
            {children}
        </ProductExtrasContext.Provider>
    );
};