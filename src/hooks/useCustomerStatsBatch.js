/**
 * Hook para obtener stats de múltiples clientes en batch.
 * Evita hacer N llamadas RPC individuales.
 * 
 * @param {string[]} customerIds - IDs de clientes para obtener stats
 * @returns {{ stats: Map, loading: boolean, error: Error | null, refreshStats: function }}
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCustomerStatsBatch } from '../lib/customerQueries';

export const useCustomerStatsBatch = (customerIds) => {
  const [stats, setStats] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Ref para evitar fetch duplicados
  const fetchedCustomerIdsRef = useRef(new Set());
  const pendingFetchRef = useRef(null);

  const loadStats = useCallback(async (idsToFetch) => {
    if (!idsToFetch || idsToFetch.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const statsData = await fetchCustomerStatsBatch(idsToFetch);
      
      setStats(prevStats => {
        const newStats = new Map(prevStats);
        statsData.forEach(stat => {
          if (stat) {
            newStats.set(stat.customer_id, stat);
          }
        });
        return newStats;
      });

      // Marcar como fetcheados
      idsToFetch.forEach(id => fetchedCustomerIdsRef.current.add(id));

    } catch (err) {
      console.error('[useCustomerStatsBatch] Error al cargar stats:', err);
      setError(err);
    } finally {
      setLoading(false);
      pendingFetchRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!customerIds || customerIds.length === 0) {
      setStats(new Map());
      return;
    }

    // Filtrar IDs que ya fueron fetcheados
    const newIds = customerIds.filter(id => !fetchedCustomerIdsRef.current.has(id));

    if (newIds.length === 0) {
      // Todos los stats ya están cargados
      return;
    }

    pendingFetchRef.current = loadStats(newIds);

  }, [customerIds, loadStats]);

  // Función para forzar recarga de stats específicos
  const refreshStats = useCallback(async (idsToRefresh) => {
    if (!idsToRefresh || idsToRefresh.length === 0) return;

    // Marcar como no fetcheados para que se recarguen
    idsToRefresh.forEach(id => fetchedCustomerIdsRef.current.delete(id));
    
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
