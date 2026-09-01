/**
 * Hook para obtener stats de múltiples clientes en batch con soporte de CacheAdminContext.
 * Evita hacer N llamadas RPC individuales y reutiliza el caché de la aplicación.
 * 
 * @param {string[]} customerIds - IDs de clientes para obtener stats
 * @returns {{ stats: Map, loading: boolean, error: Error | null, refreshStats: function, getStat: function }}
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCustomerStatsBatch } from '../lib/customerQueries';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { generateKey } from '../utils/cacheAdminUtils';

export const useCustomerStatsBatch = (customerIds) => {
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
      const statsData = await fetchCustomerStatsBatch(idsToFetch);
      
      setStats(prevStats => {
        const newStats = new Map(prevStats);
        if (Array.isArray(statsData)) {
          statsData.forEach(stat => {
            if (stat && stat.customer_id) {
              newStats.set(stat.customer_id, stat);
              setCached(
                generateKey('customer_stats', stat.customer_id),
                stat,
                DEFAULT_TTL.SHORT
              );
            }
          });
        }
        return newStats;
      });

    } catch (err) {
      console.error('[useCustomerStatsBatch] Error al cargar stats en batch:', err);
      setError(err);
    } finally {
      setLoading(false);
      pendingFetchRef.current = null;
    }
  }, [setCached, DEFAULT_TTL.SHORT]);

  useEffect(() => {
    if (!customerIds || customerIds.length === 0) {
      setStats(new Map());
      return;
    }

    const cachedMap = new Map();
    const missingIds = [];

    customerIds.forEach(id => {
      const cacheEntry = getCached(generateKey('customer_stats', id));
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
  }, [customerIds, getCached, loadStats]);

  // Función para forzar recarga de stats específicos
  const refreshStats = useCallback(async (idsToRefresh) => {
    if (!idsToRefresh || idsToRefresh.length === 0) return;
    await loadStats(idsToRefresh);
  }, [loadStats]);

  // Función para obtener stats de un solo cliente
  const getStat = useCallback((customerId) => {
    return stats.get(customerId) || null;
  }, [stats]);

  return {
    stats,
    loading,
    error,
    refreshStats,
    getStat
  };
};

