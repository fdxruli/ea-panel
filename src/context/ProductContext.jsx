// src/context/ProductContext.jsx
import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../utils/cache';
// --- ✅ 1. Importar CACHE_KEYS y CACHE_TTL ---
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { useUserData } from './UserDataContext';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
    // --- ESTADOS (sin cambios) ---
    const [baseProducts, setBaseProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [specialPrices, setSpecialPrices] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [loadingPrices, setLoadingPrices] = useState(false);
    const [error, setError] = useState(null);
    const [notification, setNotification] = useState('');
    const { customer } = useUserData();
    const customerId = customer?.id;

    // --- FETCH PRODUCTOS BASE (sin cambios) ---
    const fetchBaseProductsAndCategories = useCallback(async () => {
        console.log("🔄 Fetching base products and categories...");
        setLoadingProducts(true);
        setError(null);
        try {
            const { data: cachedData, isStale } = getCache(CACHE_KEYS.PRODUCTS, CACHE_TTL.PRODUCTS);
            if (cachedData && !isStale) {
                console.log("📦 Using cached base products and categories.");
                setBaseProducts(cachedData.products);
                setCategories(cachedData.categories);
                setLoadingProducts(false);
                return;
            }
            const [productsRes, categoriesRes] = await Promise.all([
                supabase.from('products').select(`*, product_images ( id, image_url )`).eq('is_active', true),
                supabase.from('categories').select('*')
            ]);
            if (productsRes.error) throw productsRes.error;
            if (categoriesRes.error) throw categoriesRes.error;
            const fetchedProducts = productsRes.data || [];
            const fetchedCategories = categoriesRes.data || [];
            setBaseProducts(fetchedProducts);
            setCategories(fetchedCategories);
            setCache(CACHE_KEYS.PRODUCTS, { products: fetchedProducts, categories: fetchedCategories });
            console.log("✅ Fresh base products and categories saved to state and cache.");
        } catch (err) {
            console.error("Error fetching base data:", err);
            setError(err.message);
        } finally {
            setLoadingProducts(false);
        }
    }, []);

    // --- ✅ 2. FETCH PRECIOS ESPECIALES (MODIFICADO CON CACHÉ) ---
    const fetchSpecialPrices = useCallback(async (currentCustomerId) => {
        console.log("💲 Fetching special prices for customer:", currentCustomerId);
        setLoadingPrices(true);
        setError(null);

        // --- 👇 CACHÉ PARA SPECIAL PRICES ---
        // Clave dinámica: usa el ID del cliente o 'global' si no hay cliente
        const cacheKey = `${CACHE_KEYS.SPECIAL_PRICES}-${currentCustomerId || 'global'}`;
        // Usar un TTL adecuado, por ejemplo, el mismo que PRODUCT_EXTRAS o uno propio
        const cacheTTL = CACHE_TTL.PRODUCT_EXTRAS;

        try {
            // Intentar cargar desde caché
            const { data: cachedPrices, isStale } = getCache(cacheKey, cacheTTL);
            if (cachedPrices && !isStale) {
                console.log("💰 Using cached special prices for:", currentCustomerId || 'global');
                setSpecialPrices(cachedPrices);
                setLoadingPrices(false);
                return; // Salir si el caché es válido
            }
            // --- FIN LÓGICA DE CACHÉ ---

            // Si no hay caché válido, fetchear desde DB
            const today = new Date().toISOString().split('T')[0];
            let query = supabase
                .from('special_prices')
                .select('*')
                .lte('start_date', today)
                .gte('end_date', today);

            if (currentCustomerId) {
                query = query.or(`target_customer_ids.is.null,target_customer_ids.cs.{"${currentCustomerId}"}`);
            } else {
                query = query.is('target_customer_ids', null);
            }

            const { data, error: priceError } = await query;
            if (priceError) throw priceError;

            const fetchedPrices = data || [];
            setSpecialPrices(fetchedPrices);
            // Guardar en caché
            setCache(cacheKey, fetchedPrices);
            console.log("💰 Fresh special prices updated and cached for:", currentCustomerId || 'global', fetchedPrices);

        } catch (err) {
            console.error("Error fetching special prices:", err);
            setError(err.message);
            setSpecialPrices([]);
        } finally {
            setLoadingPrices(false);
        }
        // --- Añadir CACHE_KEYS.SPECIAL_PRICES a dependencias si lo usas directamente ---
    }, [/* Dependencias originales si las había */]); // Mantener dependencias estables si es posible

    // --- Efecto carga inicial productos base (sin cambios) ---
    useEffect(() => {
        fetchBaseProductsAndCategories();
    }, [fetchBaseProductsAndCategories]);

    // --- Efecto carga precios especiales (sin cambios) ---
    useEffect(() => {
        if (!loadingProducts) {
            fetchSpecialPrices(customerId);
        }
    }, [customerId, fetchSpecialPrices, loadingProducts]);

    // src/context/ProductContext.jsx

    // --- COMBINAR PRECIOS (CON ORDENAMIENTO CORREGIDO) ---
    const productsWithAppliedPrices = useMemo(() => {
        console.log("🛠️ Applying special prices to base products...");
        if (baseProducts.length === 0) return [];

        const pricedProducts = baseProducts.map(product => {
            const productSpecificPrice = specialPrices.find(p => p.product_id === product.id);
            const categorySpecificPrice = !productSpecificPrice && specialPrices.find(
                p => p.category_id === product.category_id && !p.product_id
            );
            const specialPriceInfo = productSpecificPrice || categorySpecificPrice;
            if (specialPriceInfo) {
                return {
                    ...product,
                    original_price: product.price,
                    price: parseFloat(specialPriceInfo.override_price)
                };
            }
            const { original_price, ...restOfProduct } = product;
            return restOfProduct;
        });

        // --- 👇 LÓGICA DE ORDENAMIENTO MULTI-NIVEL ---
        return pricedProducts.sort((a, b) => {
            // 1. Obtener nombres de categorías (usar 'Z' como fallback para ordenar al final)
            const categoryA = categories.find(c => c.id === a.category_id)?.name || 'Z';
            const categoryB = categories.find(c => c.id === b.category_id)?.name || 'Z';

            const isAlitasA = categoryA === 'Alitas';
            const isAlitasB = categoryB === 'Alitas';

            // 2. Ordenamiento Primario: Categoría "Alitas" siempre primero.
            if (isAlitasA && !isAlitasB) {
                return -1; // A (Alitas) va antes que B (No Alitas)
            }
            if (!isAlitasA && isAlitasB) {
                return 1; // B (Alitas) va antes que A (No Alitas)
            }

            // 3. Ordenamiento Secundario: Si ambos son "Alitas" o ambos "No Alitas",
            //    ordenar por NOMBRE DE CATEGORÍA.
            const categoryCompare = categoryA.localeCompare(categoryB);
            if (categoryCompare !== 0) {
                // "Bebidas" (B) vendrá antes que "Extras" (E)
                return categoryCompare;
            }

            // 4. Ordenamiento Terciario: Si las categorías son iguales,
            //    ordenar por NOMBRE DE PRODUCTO.
            return a.name.localeCompare(b.name);
        });
        // --- 👆 FIN DE LA MODIFICACIÓN ---

    }, [baseProducts, specialPrices, categories]); // <-- 'categories' debe estar aquí

    // --- CATEGORÍAS VISIBLES (sin cambios) ---
    const visibleCategories = useMemo(() => {
        if (productsWithAppliedPrices.length === 0 || categories.length === 0) return [];
        const uniqueCategoryIdsInProducts = new Set(productsWithAppliedPrices.map(p => p.category_id));
        return categories.filter(c => uniqueCategoryIdsInProducts.has(c.id));
    }, [productsWithAppliedPrices, categories]);


    // --- LISTENER REALTIME (sin cambios) ---
    useEffect(() => {
        const baseChannel = supabase.channel('public:products_categories');
        const handleBaseChanges = (payload) => {
            console.log('⚡ Cambio detectado en productos/categorías base!', payload);
            setNotification('¡El menú se ha actualizado!');
            setTimeout(() => setNotification(''), 4000);
            fetchBaseProductsAndCategories();
        };
        baseChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleBaseChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleBaseChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, handleBaseChanges)
            .subscribe((status) => console.log(`Base Channel Status: ${status}`));

        const pricesChannel = supabase.channel('public:special_prices');
        const handlePriceChanges = (payload) => {
            console.log('⚡ Cambio detectado en precios especiales!', payload);
            setNotification('¡Promociones actualizadas!');
            setTimeout(() => setNotification(''), 4000);
            // --- ✅ Invalidar caché al detectar cambios ---
            // Construir la clave de caché que podría verse afectada (puede ser la global o la específica del cliente actual)
            const affectedCacheKey = `${CACHE_KEYS.SPECIAL_PRICES}-${customerId || 'global'}`;
            localStorage.removeItem(affectedCacheKey); // Elimina el caché para forzar refetch
            // Podrías intentar ser más selectivo aquí si el payload te da información útil
            fetchSpecialPrices(customerId);
        };
        pricesChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, handlePriceChanges)
            .subscribe((status) => console.log(`Prices Channel Status: ${status}`));

        return () => {
            console.log("🔌 Desconectando listeners de productos.");
            supabase.removeChannel(baseChannel);
            supabase.removeChannel(pricesChannel);
        };
    }, [customerId, fetchBaseProductsAndCategories, fetchSpecialPrices]); // Añadir CACHE_KEYS si es necesario


    // Context value (sin cambios)
    const value = {
        products: productsWithAppliedPrices,
        categories: visibleCategories,
        loading: loadingProducts || loadingPrices,
        error,
        notification,
    };

    return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};