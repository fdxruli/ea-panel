/* src/hooks/useLoyaltyTiersCache.js */
import { useAdminCache } from './useAdminCache';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { fetchAllLoyaltyTiers } from '../services/loyaltyTierService';

export const LOYALTY_TIERS_CACHE_KEY = 'customer_loyalty_tiers_admin';

/**
 * Hook reutilizable para obtener y gestionar los niveles de cliente en el panel admin y modales.
 */
export const useLoyaltyTiersCache = (options = {}) => {
  const { DEFAULT_TTL } = useCacheAdmin();

  return useAdminCache(
    LOYALTY_TIERS_CACHE_KEY,
    () => fetchAllLoyaltyTiers(true),
    {
      ttl: DEFAULT_TTL?.MEDIUM || 15 * 60 * 1000,
      staleWhileRevalidate: true,
      ...options
    }
  );
};
