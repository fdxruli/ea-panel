<<<<<<< HEAD
// src/context/ProductContext.jsx (VERSIÓN FINAL CON LISTENER ROBUSTO)

import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS } from '../config/cacheConfig';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState('');

  // Usamos useCallback sin dependencias, ya que no depende de ningún prop o estado externo.
  // Su lógica es autocontenida.
  const fetchAndCacheProducts = useCallback(async () => {
    console.log("🔄 Buscando y cacheando nuevos datos de productos...");
    try {
      const { data: productsData, error: productsError } = await supabase.from('products').select(`*, product_images ( id, image_url )`).eq('is_active', true);
      if (productsError) throw productsError;

      const { data: categoriesData, error: categoriesError } = await supabase.from('categories').select('*');
      if (categoriesError) throw categoriesError;
      
      const today = new Date().toISOString().split('T')[0];
      const { data: specialPrices, error: specialPricesError } = await supabase.from('special_prices').select('*').lte('start_date', today).gte('end_date', today);
      if (specialPricesError) throw specialPricesError;

      const finalProducts = productsData.map(product => {
        const productPrice = specialPrices.find(p => p.product_id === product.id);
        const categoryPrice = specialPrices.find(p => p.category_id === product.category_id);
        let specialPriceInfo = productPrice || categoryPrice;
        return specialPriceInfo ? { ...product, original_price: product.price, price: parseFloat(specialPriceInfo.override_price) } : product;
      });

      const uniqueCategories = [...new Set(finalProducts.map(p => p.category_id))];
      const productCategories = categoriesData.filter(c => uniqueCategories.includes(c.id));

      setProducts(finalProducts);
      setCategories(productCategories);
      setCache(CACHE_KEYS.PRODUCTS, { products: finalProducts, categories: productCategories });
      console.log("✅ Datos frescos guardados en el estado y en el caché.");
    } catch (err) {
      console.error("Error al obtener productos:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []); // <-- Array de dependencias vacío es crucial aquí.

  // --- HOOK DE CARGA INICIAL (SIN CAMBIOS) ---
  useEffect(() => {
    const cachedItem = localStorage.getItem(CACHE_KEYS.PRODUCTS);
    if (cachedItem) {
      const { data } = JSON.parse(cachedItem);
      if (data) {
        setProducts(data.products);
        setCategories(data.categories);
      }
    }
    fetchAndCacheProducts();
  }, [fetchAndCacheProducts]);

  // --- 👇 HOOK DEL LISTENER DE TIEMPO REAL (REFACTORIZACIÓN CLAVE) ---
  useEffect(() => {
    // 1. Usamos una ref para guardar la instancia del canal de Supabase.
    // La ref sobrevive a los ciclos de render y al doble montaje del StrictMode.
    const channelRef = supabase.channel('public:products_all_changes');

    const handleChanges = (payload) => {
      console.log('⚡ ¡Cambio detectado en la base de datos!', payload);
      setNotification('¡El menú se ha actualizado!');
      setTimeout(() => setNotification(''), 4000);
      
      // Llamamos a la función estable para buscar los datos.
      fetchAndCacheProducts(); 
    };

    // 2. Nos suscribimos a los eventos.
    channelRef
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, handleChanges)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Listener de tiempo real conectado y suscrito.');
        }
      });

    // 3. La función de limpieza se encarga de desuscribir el canal.
    // Esto es más seguro que removerlo por completo en cada ciclo de StrictMode.
    return () => {
      console.log("🔌 Desconectando listener de tiempo real.");
      supabase.removeChannel(channelRef);
    };
  }, [fetchAndCacheProducts]); // <-- La dependencia estable asegura que este hook solo se ejecute lo necesario.

  const value = { products, categories, loading, error, notification };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
=======
// src/context/ProductContext.jsx (VERSIÓN FINAL CON LISTENER ROBUSTO)

import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS } from '../config/cacheConfig';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState('');

  // Usamos useCallback sin dependencias, ya que no depende de ningún prop o estado externo.
  // Su lógica es autocontenida.
  const fetchAndCacheProducts = useCallback(async () => {
    console.log("🔄 Buscando y cacheando nuevos datos de productos...");
    try {
      const { data: productsData, error: productsError } = await supabase.from('products').select(`*, product_images ( id, image_url )`).eq('is_active', true);
      if (productsError) throw productsError;

      const { data: categoriesData, error: categoriesError } = await supabase.from('categories').select('*');
      if (categoriesError) throw categoriesError;
      
      const today = new Date().toISOString().split('T')[0];
      const { data: specialPrices, error: specialPricesError } = await supabase.from('special_prices').select('*').lte('start_date', today).gte('end_date', today);
      if (specialPricesError) throw specialPricesError;

      const finalProducts = productsData.map(product => {
        const productPrice = specialPrices.find(p => p.product_id === product.id);
        const categoryPrice = specialPrices.find(p => p.category_id === product.category_id);
        let specialPriceInfo = productPrice || categoryPrice;
        return specialPriceInfo ? { ...product, original_price: product.price, price: parseFloat(specialPriceInfo.override_price) } : product;
      });

      const uniqueCategories = [...new Set(finalProducts.map(p => p.category_id))];
      const productCategories = categoriesData.filter(c => uniqueCategories.includes(c.id));

      setProducts(finalProducts);
      setCategories(productCategories);
      setCache(CACHE_KEYS.PRODUCTS, { products: finalProducts, categories: productCategories });
      console.log("✅ Datos frescos guardados en el estado y en el caché.");
    } catch (err) {
      console.error("Error al obtener productos:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []); // <-- Array de dependencias vacío es crucial aquí.

  // --- HOOK DE CARGA INICIAL (SIN CAMBIOS) ---
  useEffect(() => {
    const cachedItem = localStorage.getItem(CACHE_KEYS.PRODUCTS);
    if (cachedItem) {
      const { data } = JSON.parse(cachedItem);
      if (data) {
        setProducts(data.products);
        setCategories(data.categories);
      }
    }
    fetchAndCacheProducts();
  }, [fetchAndCacheProducts]);

  // --- 👇 HOOK DEL LISTENER DE TIEMPO REAL (REFACTORIZACIÓN CLAVE) ---
  useEffect(() => {
    // 1. Usamos una ref para guardar la instancia del canal de Supabase.
    // La ref sobrevive a los ciclos de render y al doble montaje del StrictMode.
    const channelRef = supabase.channel('public:products_all_changes');

    const handleChanges = (payload) => {
      console.log('⚡ ¡Cambio detectado en la base de datos!', payload);
      setNotification('¡El menú se ha actualizado!');
      setTimeout(() => setNotification(''), 4000);
      
      // Llamamos a la función estable para buscar los datos.
      fetchAndCacheProducts(); 
    };

    // 2. Nos suscribimos a los eventos.
    channelRef
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, handleChanges)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Listener de tiempo real conectado y suscrito.');
        }
      });

    // 3. La función de limpieza se encarga de desuscribir el canal.
    // Esto es más seguro que removerlo por completo en cada ciclo de StrictMode.
    return () => {
      console.log("🔌 Desconectando listener de tiempo real.");
      supabase.removeChannel(channelRef);
    };
  }, [fetchAndCacheProducts]); // <-- La dependencia estable asegura que este hook solo se ejecute lo necesario.

  const value = { products, categories, loading, error, notification };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
};