// src/context/ProductContext.jsx

import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

const PRODUCTS_CACHE_KEY = 'el-jefe-products-cache';

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAndCacheProducts = async () => {
      try {
        setLoading(true);
        // Intenta cargar desde el caché primero
        const cachedData = localStorage.getItem(PRODUCTS_CACHE_KEY);
        if (cachedData) {
          const { products: cachedProducts, categories: cachedCategories } = JSON.parse(cachedData);
          setProducts(cachedProducts);
          setCategories(cachedCategories);
          setLoading(false); // Dejamos de cargar para una experiencia más rápida
        }

        // Siempre busca actualizaciones de la base de datos en segundo plano
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
        setError(err.message);
        console.error("Error al obtener productos:", err);
      } finally {
        // Si no había caché, ahora sí quitamos el loading.
        if (!localStorage.getItem(PRODUCTS_CACHE_KEY)) {
            setLoading(false);
        }
      }
    };

    fetchAndCacheProducts();

    // --- ¡LA MAGIA DEL TIEMPO REAL! ---
    // Escucha cualquier cambio en la tabla 'products'
    const subscription = supabase
      .channel('public:products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        console.log('¡Cambio detectado en productos!', payload);
        // Cuando hay un cambio, invalida el caché y vuelve a cargar todo.
        // Esto asegura que los datos siempre estén frescos.
        localStorage.removeItem(PRODUCTS_CACHE_KEY);
        fetchAndCacheProducts();
      })
      .subscribe();

    // Limpieza: Se desuscribe del canal cuando el componente se desmonta
    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const value = {
    products,
    categories,
    loading,
    error,
  };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};