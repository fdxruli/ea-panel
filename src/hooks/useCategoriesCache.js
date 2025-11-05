/* src/hooks/useCategoriesCache.js */
import { useAdminCache } from './useAdminCache';
import { supabase } from '../lib/supabaseClient';
import { useCacheAdmin } from '../context/CacheAdminContext';

const CACHE_KEY = 'categories';

/**
 * Fetcher function para las categorías.
 * Selecciona solo los campos necesarios.
 */
const fetchCategories = async () => {
  return await supabase
    .from('categories')
    .select('id, name, description') // Solo los campos necesarios
    .order('name');
};

/**
 * Hook reutilizable para obtener las categorías del admin,
 * con un TTL estático largo (30 min).
 */
export const useCategoriesCache = (options = {}) => {
  const { DEFAULT_TTL } = useCacheAdmin();

  return useAdminCache(
    CACHE_KEY,
    fetchCategories,
    {
      ttl: DEFAULT_TTL.STATIC, // 30 minutos
      staleWhileRevalidate: true, // Ideal para datos estáticos
      ...options
    }
  );
};