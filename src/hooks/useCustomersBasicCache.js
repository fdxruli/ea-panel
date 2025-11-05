/* src/hooks/useCustomersBasicCache.js */
import { useAdminCache } from './useAdminCache';
import { supabase } from '../lib/supabaseClient';
import { useCacheAdmin } from '../context/CacheAdminContext';

const CACHE_KEY = 'customers:basic';

/**
 * Fetcher que trae SOLO campos básicos de clientes.
 * NO incluye pedidos, direcciones ni otras relaciones.
 */
const fetchBasicCustomers = async () => {
  return await supabase
    .from('customers')
    .select(`
      id,
      name,
      phone,
      referral_code,
      referral_count,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(500); // Límite razonable
};

/**
 * Hook para obtener clientes básicos desde caché.
 * @param {object} options - Opciones adicionales para useAdminCache
 */
export const useCustomersBasicCache = (options = {}) => {
  const { DEFAULT_TTL } = useCacheAdmin();

  return useAdminCache(
    CACHE_KEY,
    fetchBasicCustomers,
    {
      ttl: DEFAULT_TTL.MEDIUM, // 5 minutos
      ...options
    }
  );
};