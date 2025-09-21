// src/context/ProductContext.jsx (CORREGIDO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

const PRODUCTS_CACHE_KEY = 'el-jefe-products-cache';

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState('');

  const fetchAndCacheProducts = useCallback(async () => {
    try {
      // ... (lógica de fetch sin cambios)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`*, product_images ( id, image_url )`)
        .eq('is_active', true);
      if (productsError) throw productsError;

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*');
      if (categoriesError) throw categoriesError;
      
      const uniqueCategories = [...new Set(productsData.map(p => p.category_id))];
      const productCategories = categoriesData.filter(c => uniqueCategories.includes(c.id));

      setProducts(productsData);
      setCategories(productCategories);
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ products: productsData, categories: productCategories }));

    } catch (err) {
      console.error("Error al obtener productos:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAndCacheProducts();

    const handleProductChange = (payload) => {
      console.log('¡Cambio detectado en productos! Actualizando...', payload);
      fetchAndCacheProducts();
      setNotification('¡El menú se ha actualizado!');
      setTimeout(() => setNotification(''), 4000);
    };
    
    // --- 👇 AQUÍ ESTÁ LA LÓGICA MEJORADA ---
    // Creamos un solo canal público para escuchar cambios en la base de datos.
    const channel = supabase.channel('public-db-changes');

    channel
      .on(
        'postgres_changes', 
        { event: '*', schema: 'public', table: 'products' }, // Escucha cualquier cambio en 'products'
        handleProductChange
      )
      .on(
        'postgres_changes', 
        { event: '*', schema: 'public', table: 'product_images' }, // Escucha cualquier cambio en 'product_images'
        (payload) => {
            console.log('¡Cambio detectado en las imágenes! Actualizando...', payload);
            fetchAndCacheProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // --- 👆 FIN DE LA LÓGICA MEJORADA ---

  }, [fetchAndCacheProducts]);

  const value = {
    products,
    categories,
    loading,
    error,
    notification,
  };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};
