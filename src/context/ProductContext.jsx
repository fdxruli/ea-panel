/* eslint-disable react-refresh/only-export-components */
import React, {
    createContext,
    useState,
    useContext,
    useEffect,
    useCallback,
    useMemo,
    useRef,
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { clearAsyncCache } from '../lib/db';
import { useUserData } from './UserDataContext';
// 1. Importar el contexto de Alertas
import { useAlert } from './AlertContext';

const ProductContext = createContext();
const EMPTY_BASE_CATALOG = { products: [], categories: [] };

const normalizeBaseCatalog = (catalog) => ({
    products: Array.isArray(catalog?.products) ? catalog.products : [],
    categories: Array.isArray(catalog?.categories) ? catalog.categories : [],
});

const serializeBaseCatalog = (catalog) => JSON.stringify(normalizeBaseCatalog(catalog));

const createSlug = (text) => {
    return text
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
};

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
    const [baseProducts, setBaseProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [specialPrices, setSpecialPrices] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [loadingPrices, setLoadingPrices] = useState(false);
    const [error, setError] = useState(null);
    
    // 2. Extraer showAlert del AlertContext superior
    const { showAlert } = useAlert();
    const { customer } = useUserData();
    const customerId = customer?.id;

    const baseCatalogSignatureRef = useRef(serializeBaseCatalog(EMPTY_BASE_CATALOG));
    const debounceBaseRef = useRef(null);
    const debouncePricesRef = useRef(null);
    // Eliminado: notificationTimerRef

    const applyBaseCatalog = useCallback((nextCatalog) => {
        const normalizedCatalog = normalizeBaseCatalog(nextCatalog);
        const nextSignature = serializeBaseCatalog(normalizedCatalog);
        const hasChanged = nextSignature !== baseCatalogSignatureRef.current;

        baseCatalogSignatureRef.current = nextSignature;

        if (hasChanged) {
            setBaseProducts(normalizedCatalog.products);
            setCategories(normalizedCatalog.categories);
        }

        return normalizedCatalog;
    }, []);

    const fetchBaseProductsAndCategories = useCallback(async ({ background = false } = {}) => {
        if (!background) setLoadingProducts(true);
        setError(null);

        try {
            const [productsRes, categoriesRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('*, product_images ( id, image_url )')
                    .eq('is_active', true),
                supabase.from('categories').select('*'),
            ]);

            if (productsRes.error) throw productsRes.error;
            if (categoriesRes.error) throw categoriesRes.error;

            const nextCatalog = {
                products: productsRes.data || [],
                categories: categoriesRes.data || [],
            };

            applyBaseCatalog(nextCatalog);
            setCache(CACHE_KEYS.PRODUCTS, nextCatalog);
        } catch (err) {
            console.error('Error fetching base data:', err);
            if (!background) setError(err.message);
        } finally {
            setLoadingProducts(false);
        }
    }, [applyBaseCatalog]);

    const fetchSpecialPrices = useCallback(async (currentCustomerId) => {
        setLoadingPrices(true);
        setError(null);

        const cacheKey = `${CACHE_KEYS.SPECIAL_PRICES}-${currentCustomerId || 'global'}`;
        const cacheTTL = CACHE_TTL.PRODUCT_EXTRAS;

        try {
            const { data: cachedPrices, isStale } = getCache(cacheKey, cacheTTL);

            if (cachedPrices && !isStale) {
                setSpecialPrices(cachedPrices);
                setLoadingPrices(false);
                return;
            }

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
            setCache(cacheKey, fetchedPrices);
        } catch (err) {
            console.error('Error fetching special prices:', err);
            setError(err.message);
            setSpecialPrices([]);
        } finally {
            setLoadingPrices(false);
        }
    }, []);

    useEffect(() => {
        const { data: cachedData } = getCache(CACHE_KEYS.PRODUCTS, CACHE_TTL.PRODUCTS);

        if (cachedData) {
            applyBaseCatalog(cachedData);
            setLoadingProducts(false);
            fetchBaseProductsAndCategories({ background: true }).catch(() => { });
            return;
        }

        fetchBaseProductsAndCategories();
    }, [applyBaseCatalog, fetchBaseProductsAndCategories]);

    useEffect(() => {
        if (!loadingProducts) {
            fetchSpecialPrices(customerId);
        }
    }, [customerId, fetchSpecialPrices, loadingProducts]);

    const productsWithAppliedPrices = useMemo(() => {
        if (baseProducts.length === 0) return [];

        const categoryMap = new Map();
        for (let i = 0; i < categories.length; i++) {
            categoryMap.set(categories[i].id, categories[i].name);
        }

        const productPricesMap = new Map();
        const categoryPricesMap = new Map();
        for (let i = 0; i < specialPrices.length; i++) {
            const sp = specialPrices[i];
            if (sp.product_id) {
                productPricesMap.set(sp.product_id, sp);
            } else if (sp.category_id) {
                categoryPricesMap.set(sp.category_id, sp);
            }
        }

        const pricedProducts = baseProducts.map(product => {
            const productSpecificPrice = productPricesMap.get(product.id);
            const categorySpecificPrice = !productSpecificPrice ? categoryPricesMap.get(product.category_id) : undefined;
            const specialPriceInfo = productSpecificPrice || categorySpecificPrice;

            const slug = createSlug(product.name);

            if (specialPriceInfo) {
                return {
                    ...product,
                    slug,
                    original_price: product.price,
                    price: parseFloat(specialPriceInfo.override_price),
                };
            }

            const productWithoutOriginalPrice = { ...product, slug };
            delete productWithoutOriginalPrice.original_price;
            return productWithoutOriginalPrice;
        });

        return pricedProducts.sort((a, b) => {
            const categoryA = categoryMap.get(a.category_id) || 'Z';
            const categoryB = categoryMap.get(b.category_id) || 'Z';

            const isAlitasA = categoryA === 'Alitas';
            const isAlitasB = categoryB === 'Alitas';

            if (isAlitasA && !isAlitasB) return -1;
            if (!isAlitasA && isAlitasB) return 1;

            const categoryCompare = categoryA.localeCompare(categoryB);
            if (categoryCompare !== 0) return categoryCompare;

            return a.name.localeCompare(b.name);
        });
    }, [baseProducts, specialPrices, categories]);

    const visibleCategories = useMemo(() => {
        if (productsWithAppliedPrices.length === 0 || categories.length === 0) return [];

        const uniqueCategoryIdsInProducts = new Set(productsWithAppliedPrices.map(p => p.category_id));
        return categories.filter(c => uniqueCategoryIdsInProducts.has(c.id));
    }, [productsWithAppliedPrices, categories]);

    useEffect(() => {
        const baseChannel = supabase.channel('public:products_categories');

        const handleBaseChanges = (payload) => {
            if (debounceBaseRef.current) clearTimeout(debounceBaseRef.current);

            debounceBaseRef.current = setTimeout(() => {
                // 3. Disparar alerta externa en lugar de mutar estado local
                showAlert('¡El menu se ha actualizado!', 'info');

                localStorage.removeItem(CACHE_KEYS.PRODUCTS);
                localStorage.removeItem(CACHE_KEYS.PRODUCTS_BASIC);
                clearAsyncCache(CACHE_KEYS.PRODUCTS_BASIC).catch(() => { });
                fetchBaseProductsAndCategories();
            }, 1500);
        };

        baseChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleBaseChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleBaseChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, handleBaseChanges)
            .subscribe();

        const pricesChannel = supabase.channel('public:special_prices');

        const handlePriceChanges = (payload) => {
            if (debouncePricesRef.current) clearTimeout(debouncePricesRef.current);

            debouncePricesRef.current = setTimeout(() => {
                // 3. Disparar alerta externa en lugar de mutar estado local
                showAlert('¡Promociones actualizadas!', 'info');

                const affectedCacheKey = `${CACHE_KEYS.SPECIAL_PRICES}-${customerId || 'global'}`;
                localStorage.removeItem(affectedCacheKey);
                fetchSpecialPrices(customerId);
            }, 1500);
        };

        pricesChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, handlePriceChanges)
            .subscribe();

        return () => {
            if (debounceBaseRef.current) clearTimeout(debounceBaseRef.current);
            if (debouncePricesRef.current) clearTimeout(debouncePricesRef.current);

            supabase.removeChannel(baseChannel);
            supabase.removeChannel(pricesChannel);
        };
    }, [customerId, fetchBaseProductsAndCategories, fetchSpecialPrices, showAlert]);

    const value = {
        products: productsWithAppliedPrices,
        categories: visibleCategories,
        loading: loadingProducts || loadingPrices,
        error,
        // Eliminado: notification
    };

    return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};