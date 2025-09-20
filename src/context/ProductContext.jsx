// src/context/ProductContext.jsx (MODIFICADO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reviews, setReviews] = useState([]); // <-- AÑADIDO: Estado para reseñas
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState('');

  // Ahora esta función carga todos los datos públicos
  const fetchPublicData = useCallback(async () => {
    try {
      // Obtenemos productos, categorías y reseñas en paralelo
      const [
        { data: productsData, error: productsError },
        { data: categoriesData, error: categoriesError },
        { data: reviewsData, error: reviewsError }
      ] = await Promise.all([
        supabase.from('products').select('*, product_images(id, image_url)').eq('is_active', true),
        supabase.from('categories').select('*'),
        supabase.from('product_reviews').select('*, products(id), customers(name)').order('created_at', { ascending: false })
      ]);

      if (productsError) throw productsError;
      if (categoriesError) throw categoriesError;
      if (reviewsError) throw reviewsError;

      const uniqueCategories = [...new Set(productsData.map(p => p.category_id))];
      const productCategories = categoriesData.filter(c => uniqueCategories.includes(c.id));

      setProducts(productsData || []);
      setCategories(productCategories || []);
      setReviews(reviewsData || []); // <-- AÑADIDO: Guardamos las reseñas

    } catch (err) {
      console.error("Error al obtener datos públicos:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPublicData(); // Carga inicial

    const handleDbChange = (payload) => {
      console.log('¡Cambio detectado en la base de datos! Actualizando...', payload);
      // Mostramos una notificación al usuario
      setNotification('¡El menú se ha actualizado!');
      setTimeout(() => setNotification(''), 4000);
      // Volvemos a cargar todos los datos para reflejar el cambio
      fetchPublicData();
    };

    // Un único canal para todos los cambios públicos
    const channel = supabase.channel('public-db-changes');

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleDbChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleDbChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, handleDbChange) // <-- AÑADIDO
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, handleDbChange) // <-- AÑADIDO
      .subscribe();

    // Limpiamos el canal al desmontar el componente
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPublicData]);

  const value = {
    products,
    categories,
    reviews, // <-- AÑADIDO: Exponemos las reseñas
    loading,
    error,
    notification,
  };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};