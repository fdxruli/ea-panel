// src/context/ProductContext.jsx (CORREGIDO Y OPTIMIZADO)

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

  // --- 👇 1. LÓGICA DE CARGA DE DATOS MEJORADA Y AISLADA ---
  const fetchAndCacheProducts = useCallback(async (isUpdate = false) => {
    try {
      // Solo mostramos el spinner si no hay datos en caché o si es una actualización en tiempo real
      const hasCache = localStorage.getItem(PRODUCTS_CACHE_KEY);
      if (!hasCache || isUpdate) {
        setLoading(true);
      }
      
      // Si no es una actualización forzada, intenta cargar el caché para mostrar algo mientras
      if (hasCache && !isUpdate) {
        const { products: cachedProducts, categories: cachedCategories } = JSON.parse(hasCache);
        setProducts(cachedProducts);
        setCategories(cachedCategories);
      }

      // Siempre busca los datos más recientes de la base de datos
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

      // Actualiza el estado y el caché con los datos frescos
      setProducts(productsData);
      setCategories(productCategories);
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ products: productsData, categories: productCategories }));

    } catch (err) {
      console.error("Error al obtener productos:", err);
      setError(err.message);
    } finally {
      // --- ✅ 2. LA CORRECCIÓN CLAVE: ESTO SE EJECUTA SIEMPRE ---
      // Nos aseguramos de que el spinner se oculte sin importar si hubo éxito o error.
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial
    fetchAndCacheProducts();

    // Suscripción a cambios en tiempo real
    const productsSubscription = supabase
      .channel('public:products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        console.log('¡Cambio detectado en productos! Recargando...', payload);
        // Llama a la función con 'true' para indicar que es una actualización y debe mostrar el spinner
        fetchAndCacheProducts(true);
      })
      .subscribe();

    // Limpieza de la suscripción
    return () => {
      supabase.removeChannel(productsSubscription);
    };
  }, [fetchAndCacheProducts]); // <-- Se añade fetchAndCacheProducts como dependencia

  const value = {
    products,
    categories,
    loading,
    error,
  };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};
