// src/context/ProductContext.jsx (CORREGIDO Y REFORZADO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState('');

  const fetchAndCacheProducts = useCallback(async () => {
    console.log("🔄 Buscando y cacheando nuevos datos de productos...");
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
        let specialPriceInfo = productPrice || categoryPrice;

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

      // Actualiza el estado de React para reflejar los cambios en la UI
      setProducts(finalProducts);
      setCategories(productCategories);
      
      // Actualiza el caché en localStorage con los nuevos datos
      setCache(CACHE_KEYS.PRODUCTS, { products: finalProducts, categories: productCategories });
      console.log("✅ Datos frescos guardados en el estado y en el caché.");

    } catch (err) {
      console.error("Error al obtener productos:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Hook #1: Se ejecuta UNA SOLA VEZ al montar el componente para la carga inicial.
  useEffect(() => {
    console.log("Iniciando ProductContext. Verificando caché inicial...");
    const { data: cachedData, isStale } = getCache(CACHE_KEYS.PRODUCTS, CACHE_TTL.PRODUCTS);

    if (cachedData && !isStale) {
      console.log("✔️ Usando datos frescos del caché.");
      setProducts(cachedData.products);
      setCategories(cachedData.categories);
      setLoading(false);
    } else {
      console.log(isStale ? "⏳ El caché está obsoleto, buscando datos nuevos." : "🤷 No hay caché, buscando datos nuevos.");
      fetchAndCacheProducts();
    }
  }, [fetchAndCacheProducts]);

  // Hook #2: Se ejecuta UNA SOLA VEZ para configurar la suscripción a tiempo real.
  useEffect(() => {
    console.log("📡 Configurando listener de Supabase para cambios en productos...");
    
    const handleChanges = (payload) => {
      console.log('⚡ ¡Cambio detectado en la base de datos!', payload);
      setNotification('¡El menú se ha actualizado!');
      setTimeout(() => setNotification(''), 4000);
      
      // Forzamos la búsqueda de datos frescos, sin importar el estado del caché.
      fetchAndCacheProducts(); 
    };

    const channel = supabase.channel('public:products_and_prices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, handleChanges)
      .subscribe();

    console.log("✅ Listener de Supabase activo.");

    // Función de limpieza para remover el canal cuando el componente se desmonte.
    return () => {
      console.log("🔌 Desconectando listener de Supabase.");
      supabase.removeChannel(channel);
    };
  }, [fetchAndCacheProducts]);

  const value = { products, categories, loading, error, notification };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};