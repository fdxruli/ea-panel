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
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { getAsyncCache, setAsyncCache } from '../lib/db';
import { useUserData } from './UserDataContext';
import { createSlug } from '../seo/config';
import { useAlert } from './AlertContext';

const ProductContext = createContext();

const EMPTY_BASE_CATALOG = { products: [], categories: [] };
const EMPTY_SPECIAL_PRICES = [];
const PRODUCTS_WITH_IMAGES_SELECT = '*, product_images ( id, image_url )';
const CLIENT_CACHE_SCOPE = 'client';
const BASE_ALERT_DELAY_MS = 400;
const PRICES_ALERT_DELAY_MS = 400;

const normalizeBaseCatalog = (catalog) => ({
    products: Array.isArray(catalog?.products) ? catalog.products : [],
    categories: Array.isArray(catalog?.categories) ? catalog.categories : [],
});

const normalizeSpecialPrices = (prices) => (
    Array.isArray(prices) ? prices : EMPTY_SPECIAL_PRICES
);

const serializeBaseCatalog = (catalog) => JSON.stringify(normalizeBaseCatalog(catalog));

const toBasicProduct = (product) => ({
    id: product?.id ?? null,
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product?.price ?? 0,
    image_url: product?.image_url ?? null,
    category_id: product?.category_id ?? null,
    is_active: Boolean(product?.is_active),
});

const toBasicProducts = (products) => (
    Array.isArray(products) ? products.map(toBasicProduct) : []
);

const buildSpecialPricesCacheKey = (customerId) => (
    `${CACHE_KEYS.SPECIAL_PRICES}-${customerId || 'global'}`
);

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
    const [baseProducts, setBaseProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [specialPrices, setSpecialPrices] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [loadingPrices, setLoadingPrices] = useState(false);
    const [error, setError] = useState(null);

    const { showAlert } = useAlert();
    const { customer } = useUserData();
    const customerId = customer?.id;

    const catalogRef = useRef(normalizeBaseCatalog(EMPTY_BASE_CATALOG));
    const alertRef = useRef(showAlert);
    const isMountedRef = useRef(false);
    const baseCatalogSignatureRef = useRef(serializeBaseCatalog(EMPTY_BASE_CATALOG));
    const baseAlertTimerRef = useRef(null);
    const priceAlertTimerRef = useRef(null);
    const baseRealtimeTimerRef = useRef(null);
    const priceRealtimeTimerRef = useRef(null);
    const baseFetchSequenceRef = useRef(0);
    const pricesFetchSequenceRef = useRef(0);

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        alertRef.current = showAlert;
    }, [showAlert]);

    const scheduleAlert = useCallback((timerRef, message, type = 'info', delayMs = BASE_ALERT_DELAY_MS) => {
        if (timerRef.current) return;

        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            alertRef.current?.(message, type);
        }, delayMs);
    }, []);

    const applyBaseCatalog = useCallback((nextCatalog) => {
        const normalizedCatalog = normalizeBaseCatalog(nextCatalog);
        const nextSignature = serializeBaseCatalog(normalizedCatalog);
        const hasCatalogChanged = nextSignature !== baseCatalogSignatureRef.current;

        catalogRef.current = normalizedCatalog;
        baseCatalogSignatureRef.current = nextSignature;

        if (hasCatalogChanged) {
            setBaseProducts(normalizedCatalog.products);
            setCategories(normalizedCatalog.categories);
        }

        return normalizedCatalog;
    }, []);

    const persistBaseCatalogCache = useCallback(async (catalog) => {
        // Solo sobrescribimos la cache cuando Supabase respondio correctamente.
        await Promise.all([
            setAsyncCache(
                {
                    key: CACHE_KEYS.PRODUCTS,
                    scope: CLIENT_CACHE_SCOPE,
                    ttl: CACHE_TTL.PRODUCTS,
                },
                catalog
            ),
            setAsyncCache(
                {
                    key: CACHE_KEYS.PRODUCTS_BASIC,
                    scope: CLIENT_CACHE_SCOPE,
                    ttl: CACHE_TTL.PRODUCTS,
                },
                toBasicProducts(catalog.products)
            ),
        ]);
    }, []);

    const fetchBaseProductsAndCategories = useCallback(async ({ background = false } = {}) => {
        const requestSequence = ++baseFetchSequenceRef.current;

        if (!background && isMountedRef.current) {
            setLoadingProducts(true);
        }

        try {
            const [productsRes, categoriesRes] = await Promise.all([
                supabase
                    .from('products')
                    .select(PRODUCTS_WITH_IMAGES_SELECT)
                    .eq('is_active', true),
                supabase.from('categories').select('*'),
            ]);

            if (productsRes.error) throw productsRes.error;
            if (categoriesRes.error) throw categoriesRes.error;

            if (requestSequence !== baseFetchSequenceRef.current) {
                return null;
            }

            const nextCatalog = normalizeBaseCatalog({
                products: productsRes.data || [],
                categories: categoriesRes.data || [],
            });

            if (isMountedRef.current) {
                applyBaseCatalog(nextCatalog);
                setError(null);
            }

            await persistBaseCatalogCache(nextCatalog);
            return nextCatalog;
        } catch (err) {
            console.error('Error fetching base data:', err);

            if (
                requestSequence === baseFetchSequenceRef.current
                && isMountedRef.current
                && !background
            ) {
                setError(err.message);
            }

            return null;
        } finally {
            if (requestSequence === baseFetchSequenceRef.current && isMountedRef.current) {
                setLoadingProducts(false);
            }
        }
    }, [applyBaseCatalog, persistBaseCatalogCache]);

    const fetchSpecialPrices = useCallback(async (currentCustomerId, { background = false } = {}) => {
        const requestSequence = ++pricesFetchSequenceRef.current;
        const cacheKey = buildSpecialPricesCacheKey(currentCustomerId);

        if (!background && isMountedRef.current) {
            setLoadingPrices(true);
        }

        try {
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

            if (requestSequence !== pricesFetchSequenceRef.current) {
                return null;
            }

            const fetchedPrices = normalizeSpecialPrices(data || []);

            if (isMountedRef.current) {
                setSpecialPrices(fetchedPrices);
                setError(null);
            }

            await setAsyncCache(
                {
                    key: cacheKey,
                    scope: CLIENT_CACHE_SCOPE,
                    ttl: CACHE_TTL.PRODUCT_EXTRAS,
                },
                fetchedPrices
            );

            return fetchedPrices;
        } catch (err) {
            console.error('Error fetching special prices:', err);

            if (
                requestSequence === pricesFetchSequenceRef.current
                && isMountedRef.current
                && !background
            ) {
                setError(err.message);
            }

            return null;
        } finally {
            if (requestSequence === pricesFetchSequenceRef.current && isMountedRef.current) {
                setLoadingPrices(false);
            }
        }
    }, []);

    const handleBaseChanges = useCallback(() => {
        if (baseRealtimeTimerRef.current) {
            clearTimeout(baseRealtimeTimerRef.current);
        }

        // El realtime solo debouncea y refetch; no invalida cache antes de la red.
        baseRealtimeTimerRef.current = window.setTimeout(() => {
            baseRealtimeTimerRef.current = null;
            scheduleAlert(baseAlertTimerRef, 'El menu se ha actualizado!', 'info', 0);
            fetchBaseProductsAndCategories({ background: true }).catch(() => {});
        }, BASE_ALERT_DELAY_MS);
    }, [fetchBaseProductsAndCategories, scheduleAlert]);

    useEffect(() => {
        const baseChannel = supabase.channel('public:products_categories');

        baseChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleBaseChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, handleBaseChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, handleBaseChanges)
            .subscribe();

        return () => {
            if (baseAlertTimerRef.current) {
                clearTimeout(baseAlertTimerRef.current);
                baseAlertTimerRef.current = null;
            }

            if (baseRealtimeTimerRef.current) {
                clearTimeout(baseRealtimeTimerRef.current);
                baseRealtimeTimerRef.current = null;
            }

            supabase.removeChannel(baseChannel);
        };
    }, [handleBaseChanges]);

    useEffect(() => {
        let cancelled = false;

        const initBaseCatalog = async () => {
            const { data: cachedCatalog, isStale } = await getAsyncCache(CACHE_KEYS.PRODUCTS);

            if (cancelled || !isMountedRef.current) return;

            if (cachedCatalog !== null) {
                applyBaseCatalog(cachedCatalog);
                setLoadingProducts(false);

                if (isStale) {
                    // Con SWR mostramos cache stale primero y revalidamos en segundo plano.
                    fetchBaseProductsAndCategories({ background: true }).catch(() => {});
                }

                return;
            }

            setLoadingProducts(true);
            fetchBaseProductsAndCategories().catch(() => {});
        };

        initBaseCatalog();

        return () => {
            cancelled = true;
        };
    }, [applyBaseCatalog, fetchBaseProductsAndCategories]);

    useEffect(() => {
        if (loadingProducts) return undefined;

        let cancelled = false;
        const cacheKey = buildSpecialPricesCacheKey(customerId);
        const initSequence = ++pricesFetchSequenceRef.current;

        const initSpecialPrices = async () => {
            setLoadingPrices(true);

            const { data: cachedPrices, isStale } = await getAsyncCache(cacheKey);

            if (
                cancelled
                || !isMountedRef.current
                || initSequence !== pricesFetchSequenceRef.current
            ) {
                return;
            }

            if (cachedPrices !== null) {
                setSpecialPrices(normalizeSpecialPrices(cachedPrices));
                setLoadingPrices(false);

                if (isStale) {
                    fetchSpecialPrices(customerId, { background: true }).catch(() => {});
                }

                return;
            }

            setSpecialPrices([]);
            fetchSpecialPrices(customerId).catch(() => {});
        };

        initSpecialPrices();

        return () => {
            cancelled = true;
        };
    }, [customerId, fetchSpecialPrices, loadingProducts]);

    useEffect(() => {
        const pricesChannel = supabase.channel(`public:special_prices:${customerId || 'global'}`);

        const handlePriceChanges = () => {
            if (priceRealtimeTimerRef.current) {
                clearTimeout(priceRealtimeTimerRef.current);
            }

            priceRealtimeTimerRef.current = window.setTimeout(() => {
                priceRealtimeTimerRef.current = null;
                scheduleAlert(priceAlertTimerRef, 'Promociones actualizadas!', 'info', 0);
                fetchSpecialPrices(customerId, { background: true }).catch(() => {});
            }, PRICES_ALERT_DELAY_MS);
        };

        pricesChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, handlePriceChanges)
            .subscribe();

        return () => {
            if (priceAlertTimerRef.current) {
                clearTimeout(priceAlertTimerRef.current);
                priceAlertTimerRef.current = null;
            }

            if (priceRealtimeTimerRef.current) {
                clearTimeout(priceRealtimeTimerRef.current);
                priceRealtimeTimerRef.current = null;
            }

            supabase.removeChannel(pricesChannel);
        };
    }, [customerId, fetchSpecialPrices, scheduleAlert]);

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

        const pricedProducts = baseProducts.map((product) => {
            const productSpecificPrice = productPricesMap.get(product.id);
            const categorySpecificPrice = !productSpecificPrice
                ? categoryPricesMap.get(product.category_id)
                : undefined;
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

        const uniqueCategoryIdsInProducts = new Set(productsWithAppliedPrices.map((product) => product.category_id));
        return categories.filter((category) => uniqueCategoryIdsInProducts.has(category.id));
    }, [productsWithAppliedPrices, categories]);

    const value = {
        products: productsWithAppliedPrices,
        categories: visibleCategories,
        loading: loadingProducts || loadingPrices,
        error,
    };

    return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};
