import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { fetchClientBasicProducts } from '../lib/productQueries';
import { getAsyncCache, setAsyncCache, clearAsyncCache } from '../lib/db';
import { sanitizeDataset } from '../utils/dataSanitizer';

const productSchemaRules = {
  primaryKey: 'id',
  fallbackKey: 'product_id',
  fields: ['id', 'name', 'description', 'price', 'image_url', 'category_id', 'is_active'],
  required: ['name', 'category_id', 'is_active'],
  defaults: {
    description: '',
    price: 0,
    image_url: null,
  },
};

const EMPTY_PRODUCTS = [];
const inFlightRequests = new Map();

const normalizeProducts = (products) => (
  Array.isArray(products) ? products : EMPTY_PRODUCTS
);

const fetchProductsWithDedup = async (cacheKey) => {
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const request = (async () => {
    const { data, error } = await fetchClientBasicProducts();
    if (error) throw error;

    try {
      return normalizeProducts(sanitizeDataset(data ?? [], productSchemaRules, 0.05));
    } catch (validationError) {
      console.error('Fallo critico en validacion de esquema:', validationError);
      throw validationError;
    }
  })();

  inFlightRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
};

let globalWriteSequence = 0;
const pendingCacheWrites = new Map();

export const useClientProductsBasic = (options = {}) => {
  const {
    enabled = true,
    ttl = CACHE_TTL.PRODUCTS,
    revalidateOnMount = true,
  } = options;

  const cacheKey = CACHE_KEYS.PRODUCTS_BASIC;
  const cacheScope = 'client';

  const mountedRef = useRef(false);
  const isInitializedRef = useRef(false);

  const [data, setData] = useState(EMPTY_PRODUCTS);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isValidating, setIsValidating] = useState(false);
  const [isCached, setIsCached] = useState(false);

  const applyProducts = useCallback((nextProducts, { fromCache = false } = {}) => {
    const normalizedProducts = normalizeProducts(nextProducts);
    setData(normalizedProducts);
    setIsCached(fromCache);
    return normalizedProducts;
  }, []);

  const revalidate = useCallback(async ({ suppressError = false } = {}) => {
    const currentSequence = ++globalWriteSequence;
    pendingCacheWrites.set(cacheKey, currentSequence);
    setIsValidating(true);

    try {
      const freshProducts = await fetchProductsWithDedup(cacheKey);
      const normalizedProducts = applyProducts(freshProducts, { fromCache: false });

      if (pendingCacheWrites.get(cacheKey) === currentSequence) {
        setAsyncCache({ key: cacheKey, scope: cacheScope, ttl }, normalizedProducts).catch(console.error);
      }

      if (!mountedRef.current) return normalizedProducts;

      setIsLoading(false);
      setError(null);
      return normalizedProducts;
    } catch (fetchError) {
      if (!mountedRef.current) return;

      if (!suppressError) {
        setError(fetchError);
      }
      setIsLoading(false);
    } finally {
      if (mountedRef.current) {
        setIsValidating(false);
      }
      if (pendingCacheWrites.get(cacheKey) === currentSequence) {
        pendingCacheWrites.delete(cacheKey);
      }
    }
  }, [applyProducts, cacheKey, cacheScope, ttl]);

  const refetch = useCallback(() => {
    return revalidate({ suppressError: data !== EMPTY_PRODUCTS });
  }, [revalidate, data]);

  const invalidate = useCallback(() => {
    return clearAsyncCache(cacheKey);
  }, [cacheKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setIsValidating(false);
      return;
    }

    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const init = async () => {
      setIsLoading(true);

      const { data: cachedProducts, isStale } = await getAsyncCache(cacheKey);

      if (!mountedRef.current) return;

      const hasCachedProducts = cachedProducts !== null;

      if (hasCachedProducts) {
        applyProducts(cachedProducts, { fromCache: true });
        setIsLoading(false);
      }

      const shouldRevalidate = !hasCachedProducts || isStale || revalidateOnMount;

      if (shouldRevalidate) {
        revalidate({ suppressError: hasCachedProducts }).catch(() => {});
      } else {
        setIsLoading(false);
        setIsValidating(false);
      }
    };

    init();
  }, [enabled, cacheKey, revalidateOnMount, revalidate, applyProducts]);

  return {
    data,
    isLoading,
    isValidating,
    isCached,
    isError: Boolean(error),
    error,
    refetch,
    invalidate
  };
};
