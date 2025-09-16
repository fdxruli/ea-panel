// src/context/ProductContext.jsx (MODIFICADO PARA USAR NOTIFICACIONES)

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
  // --- 👇 1. NUEVO ESTADO PARA LA NOTIFICACIÓN ---
  const [notification, setNotification] = useState('');

  const fetchAndCacheProducts = useCallback(async () => {
    try {
      const hasCache = localStorage.getItem(PRODUCTS_CACHE_KEY);
      // Solo mostramos el spinner la primera vez que no hay nada en caché
      if (!hasCache) {
        setLoading(true);
      }
      
      // ... (El resto de la lógica de fetch y caché no cambia)
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
      // Siempre nos aseguramos de que el spinner principal se oculte
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAndCacheProducts();

    const productsSubscription = supabase
      .channel('public:products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        console.log('¡Cambio detectado! Actualizando en segundo plano...', payload);
        
        // --- 👇 2. LÓGICA DE NOTIFICACIÓN EN LUGAR DE SPINNER ---
        // Llama a la función para que se actualice en segundo plano (sin spinner)
        fetchAndCacheProducts(); 
        
        // Muestra el mensaje de notificación
        setNotification('¡El menú se ha actualizado!');
        
        // Oculta el mensaje después de 4 segundos
        setTimeout(() => setNotification(''), 4000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(productsSubscription);
    };
  }, [fetchAndCacheProducts]);

  const value = {
    products,
    categories,
    loading,
    error,
    notification, // <-- 3. EXPONEMOS LA NOTIFICACIÓN EN EL CONTEXTO
  };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};