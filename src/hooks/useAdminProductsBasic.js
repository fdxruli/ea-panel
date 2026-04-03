import { useAdminCache } from './useAdminCache';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { fetchAdminBasicProducts } from '../lib/productQueries';

export const ADMIN_PRODUCTS_BASIC_CACHE_KEY = 'products:basic';

/**
 * Hook admin-only para listados básicos de productos.
 * Usa CacheAdminContext + sessionStorage para respetar el ciclo de vida del panel.
 */
export const useAdminProductsBasic = (options = {}) => {
  const { DEFAULT_TTL } = useCacheAdmin();

  return useAdminCache(
    ADMIN_PRODUCTS_BASIC_CACHE_KEY,
    fetchAdminBasicProducts,
    {
      ttl: DEFAULT_TTL.MEDIUM,
      ...options
    }
  );
};
