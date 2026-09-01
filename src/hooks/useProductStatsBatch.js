/**
 * Hook para obtener stats de múltiples productos en batch con soporte de CacheAdminContext.
 * Evita hacer N llamadas RPC individuales y reutiliza el caché de la aplicación.
 * 
 * @param {string[]} productIds - IDs de productos para obtener stats
 * @returns {{ stats: Map, loading: boolean, error: Error | null, refreshStats: function, getStat: function }}
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchProductStatsBatch } from '../lib/productQueries';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { generateKey } from '../utils/cacheAdminUtils';

export const useProductStatsBatch = (productIds) => {
  const { getCached, setCached, DEFAULT_TTL } = useCacheAdmin();
  const [stats, setStats] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const pendingFetchRef = useRef(null);

  const loadStats = useCallback(async (idsToFetch) => {
    if (!idsToFetch || idsToFetch.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const statsData = await fetchProductStatsBatch(idsToFetch);
      
      setStats(prevStats => {
        const newStats = new Map(prevStats);
        if (Array.isArray(statsData)) {
          statsData.forEach(stat => {
            if (stat && stat.product_id) {
              newStats.set(stat.product_id, stat);
              setCached(
                generateKey('product_stats', stat.product_id),
                stat,
                DEFAULT_TTL.SHORT
              );
            }
          });
        }
        return newStats;
      });

    } catch (err) {
      console.error('[useProductStatsBatch] Error al cargar stats en batch:', err);
      setError(err);
    } finally {
      setLoading(false);
      pendingFetchRef.current = null;
    }
  }, [setCached, DEFAULT_TTL.SHORT]);

  useEffect(() => {
    if (!productIds || productIds.length === 0) {
      setStats(new Map());
      return;
    }

    const cachedMap = new Map();
    const missingIds = [];

    productIds.forEach(id => {
      const cacheEntry = getCached(generateKey('product_stats', id));
      if (cacheEntry && !cacheEntry.isExpired && cacheEntry.data) {
        cachedMap.set(id, cacheEntry.data);
      } else {
        missingIds.push(id);
      }
    });

    if (cachedMap.size > 0) {
      setStats(prev => new Map([...prev, ...cachedMap]));
    }

    if (missingIds.length > 0) {
      pendingFetchRef.current = loadStats(missingIds);
    }
  }, [productIds, getCached, loadStats]);

  // Función para forzar recarga de stats específicos
  const refreshStats = useCallback(async (idsToRefresh) => {
    if (!idsToRefresh || idsToRefresh.length === 0) return;
    await loadStats(idsToRefresh);
  }, [loadStats]);

  // Función para obtener stats de un solo producto
  const getStat = useCallback((productId) => {
    return stats.get(productId) || null;
  }, [stats]);

  return {
    stats,
    loading,
    error,
    refreshStats,
    getStat
  };
};

