import React, { createContext, useContext, useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { getAsyncCache, setAsyncCache, clearAsyncCache } from '../lib/db';
import { useCustomer } from './CustomerContext';
import { createSlug } from '../seo/config';
import { useAlert } from './AlertContext';
import { subscribeToStoreBroadcast } from '../lib/broadcastRealtime';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';

const ProductContext = createContext();
const CLIENT_CACHE_SCOPE = 'client';
const EMPTY_CATALOG = { products: [], categories: [] };

const buildSpecialPricesCacheKey = (customerId) => `${CACHE_KEYS.SPECIAL_PRICES}-${customerId || 'global'}`;
const normalizeCatalog = (value) => ({
    products: Array.isArray(value?.products) ? value.products : [],
    categories: Array.isArray(value?.categories) ? value.categories : [],
});

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
    const { customerId, isAuthenticated, isLinked, isCustomerLoading } = useCustomer();
    const { showAlert } = useAlert();
    const [baseCatalog, setBaseCatalog] = useState(EMPTY_CATALOG);
    const [specialPrices, setSpecialPrices] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [loadingPrices, setLoadingPrices] = useState(false);
    const [error, setError] = useState(null);
    const [validatedCatalogScope, setValidatedCatalogScope] = useState(undefined);
    const mountedRef = useRef(false);
    const baseSequenceRef = useRef(0);
    const priceSequenceRef = useRef(0);
    const priceTimerRef = useRef(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const fetchCatalog = useCallback(async ({ background = false } = {}) => {
        const sequence = ++baseSequenceRef.current;
        if (!background) setLoadingProducts(true);
        try {
            const [{ data: productsData, error: productsError }, { data: categoriesData, error: categoriesError }] = await Promise.all([
                supabase.rpc('get_active_menu_products'),
                supabase.from('categories').select('*'),
            ]);
            if (productsError) throw productsError;
            if (categoriesError) throw categoriesError;
            if (sequence !== baseSequenceRef.current || !mountedRef.current) return null;
            const catalog = normalizeCatalog({ products: productsData || [], categories: categoriesData || [] });
            setBaseCatalog(catalog);
            setValidatedCatalogScope(customerId || null);
            setError(null);
            const scope = customerId || 'public';
            await Promise.all([
                setAsyncCache({ key: `${CACHE_KEYS.PRODUCTS}-${scope}`, scope: CLIENT_CACHE_SCOPE, ttl: CACHE_TTL.PRODUCTS }, catalog),
                setAsyncCache({ key: `${CACHE_KEYS.PRODUCTS_BASIC}-${scope}`, scope: CLIENT_CACHE_SCOPE, ttl: CACHE_TTL.PRODUCTS }, catalog.products.map((p) => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url }))),
            ]);
            return catalog;
        } catch (err) {
            if (sequence === baseSequenceRef.current && mountedRef.current && !background) setError(err.message || 'No se pudo cargar el menú.');
            return null;
        } finally {
            if (sequence === baseSequenceRef.current && mountedRef.current) setLoadingProducts(false);
        }
    }, [customerId]);

    const fetchSpecialPrices = useCallback(async ({ background = false } = {}) => {
        const sequence = ++priceSequenceRef.current;
        const cacheKey = buildSpecialPricesCacheKey(customerId);
        if (!background) setLoadingPrices(true);
        try {
            // Customer pricing is resolved exclusively by the Auth-safe RPC.
            // No customer_id is supplied, so the backend derives ownership from auth.uid().
            const { data, error: priceError } = await supabase.rpc('get_my_special_prices');
            if (priceError) throw priceError;
            if (sequence !== priceSequenceRef.current || !mountedRef.current) return null;
            const prices = Array.isArray(data) ? data : [];
            setSpecialPrices(prices);
            setError(null);
            await setAsyncCache({ key: cacheKey, scope: CLIENT_CACHE_SCOPE, ttl: CACHE_TTL.PRODUCT_EXTRAS }, prices);
            return prices;
        } catch (err) {
            if (sequence === priceSequenceRef.current && mountedRef.current && !background) setError(err.message || 'No se pudieron cargar los precios.');
            return null;
        } finally {
            if (sequence === priceSequenceRef.current && mountedRef.current) setLoadingPrices(false);
        }
    }, [customerId]);

    useEffect(() => {
        if (isCustomerLoading) return undefined;
        let cancelled = false;
        const scope = customerId || 'public';
        const key = `${CACHE_KEYS.PRODUCTS}-${scope}`;
        const init = async () => {
            const { data: cached } = await getAsyncCache(key);
            if (cancelled || !mountedRef.current) return;
            if (cached !== null) {
                setBaseCatalog(normalizeCatalog(cached));
                setLoadingProducts(false);
                fetchCatalog({ background: true }).catch(() => {});
            } else {
                fetchCatalog().catch(() => {});
            }
        };
        init();
        return () => { cancelled = true; };
    }, [customerId, fetchCatalog, isCustomerLoading]);

    useEffect(() => {
        if (isCustomerLoading) return undefined;
        let cancelled = false;
        const key = buildSpecialPricesCacheKey(customerId);
        const init = async () => {
            const { data: cached } = await getAsyncCache(key);
            if (cancelled || !mountedRef.current) return;
            if (cached !== null) {
                setSpecialPrices(Array.isArray(cached) ? cached : []);
                setLoadingPrices(false);
                fetchSpecialPrices({ background: true }).catch(() => {});
            } else {
                fetchSpecialPrices().catch(() => {});
            }
        };
        init();
        return () => { cancelled = true; };
    }, [customerId, fetchSpecialPrices, isCustomerLoading]);

    useEffect(() => {
        const onFocus = () => {
            if (document.visibilityState !== 'visible' || isCustomerLoading) return;
            fetchCatalog({ background: true }).catch(() => {});
            fetchSpecialPrices({ background: true }).catch(() => {});
        };
        document.addEventListener('visibilitychange', onFocus);
        window.addEventListener('online', onFocus);
        window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, onFocus);
        return () => {
            document.removeEventListener('visibilitychange', onFocus);
            window.removeEventListener('online', onFocus);
            window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, onFocus);
        };
    }, [fetchCatalog, fetchSpecialPrices, isCustomerLoading]);

    useEffect(() => {
        const channel = supabase.channel('public:products-customer-auth')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchCatalog({ background: true }))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, () => fetchCatalog({ background: true }))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => fetchCatalog({ background: true }))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, () => {
                clearAsyncCache(buildSpecialPricesCacheKey(customerId)).catch(() => {});
                if (priceTimerRef.current) clearTimeout(priceTimerRef.current);
                priceTimerRef.current = setTimeout(() => fetchSpecialPrices({ background: true }), 400);
            })
            .subscribe();
        const unsubCatalog = subscribeToStoreBroadcast('catalog_updated', () => fetchCatalog({ background: true }));
        const unsubInventory = subscribeToStoreBroadcast('inventory_updated', () => fetchCatalog({ background: true }));
        const unsubPrices = subscribeToStoreBroadcast('special_prices_updated', () => fetchSpecialPrices({ background: true }));
        return () => {
            if (priceTimerRef.current) clearTimeout(priceTimerRef.current);
            unsubCatalog?.(); unsubInventory?.(); unsubPrices?.();
            supabase.removeChannel(channel);
        };
    }, [customerId, fetchCatalog, fetchSpecialPrices]);

    const products = useMemo(() => {
        const categoryMap = new Map(baseCatalog.categories.map((category) => [category.id, category.name]));
        const productPrices = new Map();
        const categoryPrices = new Map();
        if (isAuthenticated && isLinked) {
            for (const sp of specialPrices) {
                if (sp.product_id) productPrices.set(sp.product_id, sp);
                if (sp.category_id) categoryPrices.set(sp.category_id, sp);
            }
        }
        return baseCatalog.products.map((product) => {
            const special = productPrices.get(product.id) || categoryPrices.get(product.category_id);
            const next = { ...product, slug: createSlug(product.name) };
            if (special) { next.original_price = product.price; next.price = Number(special.override_price); }
            return next;
        }).sort((a, b) => {
            const ca = categoryMap.get(a.category_id) || 'Z';
            const cb = categoryMap.get(b.category_id) || 'Z';
            if (ca === 'Alitas' && cb !== 'Alitas') return -1;
            if (ca !== 'Alitas' && cb === 'Alitas') return 1;
            const cc = ca.localeCompare(cb);
            return cc || a.name.localeCompare(b.name);
        });
    }, [baseCatalog, isAuthenticated, isLinked, specialPrices]);

    const categories = useMemo(() => {
        const used = new Set(products.map((product) => product.category_id));
        return baseCatalog.categories.filter((category) => used.has(category.id));
    }, [baseCatalog.categories, products]);

    const refetch = useCallback(() => Promise.all([fetchCatalog(), fetchSpecialPrices()]), [fetchCatalog, fetchSpecialPrices]);

    const value = useMemo(() => ({
        products,
        categories,
        loading: loadingProducts || loadingPrices,
        catalogReady: validatedCatalogScope === (customerId || null),
        error,
        refetch,
    }), [categories, customerId, error, loadingPrices, loadingProducts, products, refetch, validatedCatalogScope]);

    return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};
