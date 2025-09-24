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
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`*, product_images ( id, image_url )`)
        .eq('is_active', true);
      if (productsError) throw productsError;

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*');
      if (categoriesError) throw categoriesError;

      const today = new Date().toISOString().split('T')[0];
      // --- 👇 AQUÍ ESTÁ LA CORRECCIÓN ---
      const { data: specialPrices, error: specialPricesError } = await supabase
        .from('special_prices') // CAMBIADO DE 'special_prices' a 'special_price'
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today);

      if (specialPricesError) throw specialPricesError;

      const finalProducts = productsData.map(product => {
        const productPrice = specialPrices.find(p => p.product_id === product.id);
        const categoryPrice = specialPrices.find(p => p.category_id === product.category_id);

        let specialPriceInfo = null;
        if (productPrice) {
          specialPriceInfo = productPrice;
        } else if (categoryPrice) {
          specialPriceInfo = categoryPrice;
        }

        if (specialPriceInfo) {
          return {
            ...product,
            original_price: product.price,
            price: parseFloat(specialPriceInfo.override_price)
          };
        }
        
        return product;
      });

      const uniqueCategories = [...new Set(finalProducts.map(p => p.category_id))];
      const productCategories = categoriesData.filter(c => uniqueCategories.includes(c.id));

      setProducts(finalProducts);
      setCategories(productCategories);
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ products: finalProducts, categories: productCategories }));

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

    const channel = supabase.channel('public-db-changes');

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        handleProductChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_images' },
        (payload) => {
            console.log('¡Cambio detectado en las imágenes! Actualizando...', payload);
            fetchAndCacheProducts();
        }
      )
      .on(
        'postgres_changes',
        // --- 👇 CORRECCIÓN ADICIONAL AQUÍ TAMBIÉN ---
        { event: '*', schema: 'public', table: 'special_price' }, // CAMBIADO
        (payload) => {
            console.log('¡Cambio detectado en los precios especiales! Actualizando...', payload);
            fetchAndCacheProducts();
            setNotification('¡Las promociones se han actualizado!');
            setTimeout(() => setNotification(''), 4000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };

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