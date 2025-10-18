import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS } from '../config/cacheConfig';
// Import necessary hooks
import { useUserData } from './UserDataContext'; // Importar useUserData para obtener el cliente

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState('');

  // Usar UserDataContext para obtener el ID del cliente actual
  const { customer } = useUserData();
  const customerId = customer?.id; // Obtener el ID del cliente actual o null si no está logueado

  const fetchAndCacheProducts = useCallback(async () => {
    console.log("🔄 Fetching and caching product data, considering customer:", customerId);
    setLoading(true); // Asegurar que el estado de carga se establezca al principio
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

      // --- QUERY MODIFICADA para special_prices ---
      let specialPricesQuery = supabase
        .from('special_prices')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today);

      if (customerId) {
        // Si hay un cliente logueado, obtener precios para todos (NULL) O específicamente para él
        specialPricesQuery = specialPricesQuery.or(`target_customer_ids.is.null,target_customer_ids.cs.{"${customerId}"}`);
      } else {
        // Si no hay cliente logueado, solo obtener precios para todos
        specialPricesQuery = specialPricesQuery.is('target_customer_ids', null);
      }

      const { data: specialPrices, error: specialPricesError } = await specialPricesQuery;
      // --- FIN DE LA QUERY MODIFICADA ---

      if (specialPricesError) throw specialPricesError;

      // --- El resto de la lógica permanece igual ---
        const finalProducts = productsData.map(product => {
        // Priorizar precio específico del producto, luego precio de categoría
        const productSpecificPrice = specialPrices.find(p => p.product_id === product.id);
        const categorySpecificPrice = specialPrices.find(p => p.category_id === product.category_id && !p.product_id); // Asegurar que sea solo de categoría

        let specialPriceInfo = productSpecificPrice || categorySpecificPrice;

        // Asegurar que el precio encontrado sea aplicable (global o dirigido a este cliente)
        // Esta doble verificación puede ser redundante si la consulta es correcta, pero añade seguridad.
        if (specialPriceInfo && (specialPriceInfo.target_customer_ids === null || (customerId && specialPriceInfo.target_customer_ids.includes(customerId)))) {
           return { ...product, original_price: product.price, price: parseFloat(specialPriceInfo.override_price) };
        }
        return product; // Devuelve el producto original si no se encuentra un precio especial aplicable
      });

      const uniqueCategories = [...new Set(finalProducts.map(p => p.category_id))];
      const productCategories = categoriesData.filter(c => uniqueCategories.includes(c.id));

      setProducts(finalProducts);
      setCategories(productCategories);
      setCache(CACHE_KEYS.PRODUCTS, { products: finalProducts, categories: productCategories });
      console.log("✅ Fresh data saved to state and cache.");
    } catch (err) {
      console.error("Error fetching products:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // Añadir customerId como dependencia
  }, [customerId]); // Añadir customerId aquí

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

  // --- HOOK DEL LISTENER DE TIEMPO REAL (REFACTORIZACIÓN CLAVE) ---
  useEffect(() => {
    const channelRef = supabase.channel('public:products_all_changes');

    const handleChanges = (payload) => {
      console.log('⚡ ¡Cambio detectado en la base de datos!', payload);
      setNotification('¡El menú se ha actualizado!');
      setTimeout(() => setNotification(''), 4000);
      fetchAndCacheProducts();
    };

    channelRef
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleChanges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, handleChanges) // Escuchar cambios en precios especiales
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, handleChanges) // Escuchar cambios en categorías
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Listener de tiempo real conectado y suscrito.');
        }
      });

    return () => {
      console.log("🔌 Desconectando listener de tiempo real.");
      supabase.removeChannel(channelRef);
    };
  }, [fetchAndCacheProducts]);

  const value = { products, categories, loading, error, notification };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};
