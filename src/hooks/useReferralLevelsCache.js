/* src/hooks/useReferralLevelsCache.js */
import { useAdminCache } from './useAdminCache';
import { supabase } from '../lib/supabaseClient';
import { useCacheAdmin } from '../context/CacheAdminContext';

const CACHE_KEY = 'referral_levels';

/**
 * Fetcher function para los niveles de referidos.
 */
const fetchReferralLevels = async () => {
  return await supabase
    .from('referral_levels')
    .select('*')
    .order('min_referrals', { ascending: true });
};

/**
 * Hook reutilizable para obtener los niveles de referidos,
 * con un TTL estático largo (30 min).
 */
export const useReferralLevelsCache = (options = {}) => {
  const { DEFAULT_TTL } = useCacheAdmin();

  return useAdminCache(
    CACHE_KEY,
    fetchReferralLevels,
    {
      ttl: DEFAULT_TTL.STATIC, // 30 minutos
      staleWhileRevalidate: true,
      ...options
    }
  );
};