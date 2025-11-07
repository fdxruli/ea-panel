/* src/hooks/useProductsBasicCache.js */
import { useAdminCache } from './useAdminCache';
import { supabase } from '../lib/supabaseClient';
import { useCacheAdmin } from '../context/CacheAdminContext';

const CACHE_KEY = 'products:basic';

/**
 * Fetcher que trae SOLO campos básicos de productos.
 * NO incluye stats (total_sold, reviews, avg_rating, etc.)
 * Ideal para: listados, dropdowns, búsquedas.
 */
const fetchBasicProducts = async () => {
  return await supabase
    .from('products')
    .select(`
      id,
      name,
      description,
      price,
      cost,
      image_url,
      category_id,
      is_active
    `)
    //.eq('is_active', true)
    .order('name');
};

/**
 * Hook para obtener productos básicos desde caché.
 * @param {object} options - Opciones adicionales para useAdminCache
 */
export const useProductsBasicCache = (options = {}) => {
  const { DEFAULT_TTL } = useCacheAdmin();

  return useAdminCache(
    CACHE_KEY,
    fetchBasicProducts,
    {
      ttl: DEFAULT_TTL.MEDIUM, // 5 minutos
      ...options
    }
  );
};