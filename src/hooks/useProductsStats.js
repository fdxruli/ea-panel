/* src/hooks/useProductStats.js */
import { useAdminCache } from './useAdminCache';
import { supabase } from '../lib/supabaseClient';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { generateKey } from '../utils/cacheAdminUtils';

/**
 * Fetcher para stats de un producto específico.
 * @param {string} productId - ID del producto
 */
const fetchProductStats = async (productId) => {
  // Primero intentar RPC (si existe)
  const { data, error } = await supabase.rpc('get_product_stats_single', {
    p_product_id: productId
  });

  // Si la RPC falla (devuelve null) o no existe, usar el fallback
  if (!data && !error) { // Asumimos que si no hay data y no hay error, la RPC no devolvió nada
    console.warn(`[Cache] RPC 'get_product_stats_single' no devolvió datos para ${productId}. Usando fallback.`);
    
    const [salesData, reviewsData, favoritesData] = await Promise.all([
      // Total vendido
      supabase
        .from('order_items')
        .select('quantity, price, orders!inner(status)')
        .eq('product_id', productId)
        .eq('orders.status', 'completado'),
        
      // Reviews (usando la tabla 'product_reviews' como en MyStuff.jsx)
      supabase
        .from('product_reviews')
        .select('rating')
        .eq('product_id', productId),
        
      // Favoritos (usando la tabla 'customer_favorites' como en MyStuff.jsx)
      supabase
        .from('customer_favorites')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
    ]);

    // Calcular stats manualmente
    const totalSold = salesData.data?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const totalRevenue = salesData.data?.reduce((sum, item) => sum + (item.quantity * item.price), 0) || 0;
    const avgRating = reviewsData.data?.length > 0
      ? reviewsData.data.reduce((sum, r) => sum + r.rating, 0) / reviewsData.data.length
      : null;
    const reviewsCount = reviewsData.data?.length || 0;
    const favoritesCount = favoritesData.count || 0;

    return {
      data: {
        product_id: productId,
        total_sold: totalSold,
        total_revenue: totalRevenue,
        avg_rating: avgRating,
        reviews_count: reviewsCount,
        favorites_count: favoritesCount
      },
      error: null
    };
  }
  
  // Si la RPC funcionó (o falló con error), devolver su resultado
  return { data, error };
};

/**
 * Hook para obtener stats de un producto específico.
 * @param {string} productId - ID del producto (null/undefined para no ejecutar)
 * @param {object} options - Opciones adicionales
 */
export const useProductStats = (productId, options = {}) => {
  const { DEFAULT_TTL } = useCacheAdmin();

  // Generar key única por producto
  const cacheKey = productId ? generateKey('product_stats', productId) : null;

  return useAdminCache(
    cacheKey,
    // El fetcher de useAdminCache no acepta argumentos,
    // así que lo envolvemos en una función anónima
    () => fetchProductStats(productId),
    {
      ttl: DEFAULT_TTL.SHORT, // 1 minuto (stats cambian más frecuentemente)
      enabled: !!productId, // Solo ejecutar si hay productId
      ...options
    }
  );
};