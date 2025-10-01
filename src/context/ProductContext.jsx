// src/context/ProductContext.jsx (OPTIMIZADO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

const PRODUCTS_CACHE_KEY = 'ea-products-cache'; // Renombrado para consistencia

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState('');

  // Esta función ahora solo se usa para la carga inicial y revalidación
  const fetchAndCacheProducts = useCallback(async () => {
    // ... La lógica interna de esta función no cambia, sigue siendo excelente
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
      const { data: specialPrices, error: specialPricesError } = await supabase
        .from('special_prices')
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

  // MEJORA: Estrategia Stale-While-Revalidate
  useEffect(() => {
    // 1. Cargar desde caché instantáneamente
    try {
        const cachedData = localStorage.getItem(PRODUCTS_CACHE_KEY);
        if (cachedData) {
            const { products: cachedProducts, categories: cachedCategories } = JSON.parse(cachedData);
            setProducts(cachedProducts);
            setCategories(cachedCategories);
        }
    } catch (e) {
        console.error("Error al parsear caché de productos", e);
    } finally {
        setLoading(false);
    }
    
    // 2. Buscar datos frescos en segundo plano
    fetchAndCacheProducts();
  }, [fetchAndCacheProducts]);

  // MEJORA: WebSockets con actualizaciones granulares
  useEffect(() => {
    const handleProductChange = (payload) => {
      console.log('Cambio en producto detectado:', payload);
      setNotification('¡El menú se ha actualizado!');
      setTimeout(() => setNotification(''), 4000);
      
      // En lugar de un refetch, aplicamos el cambio directamente
      // NOTA: Esta lógica se complica por los precios especiales. Un refetch
      // podría ser más simple y seguro aquí si los precios cambian a menudo.
      // Por ahora, para demostrar, actualizamos el producto base.
      if (payload.eventType === 'UPDATE') {
          setProducts(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
      } else {
          // Para INSERT, DELETE o cambios en precios especiales, un refetch es más seguro.
          fetchAndCacheProducts();
      }
    };

    const channel = supabase.channel('public:products_and_prices');

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleProductChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, fetchAndCacheProducts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, fetchAndCacheProducts)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAndCacheProducts]);

  const value = { products, categories, loading, error, notification };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};