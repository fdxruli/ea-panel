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
  // Intentar RPC primero
  const { data, error } = await supabase.rpc('get_product_stats_single', {
    p_product_id: productId
  });

  // --- CORRECCIÓN CRÍTICA ---
  // Si la RPC no existe (error) O no devolvió datos, usar fallback
  if (!data || error) {
    if (error) {
      console.warn(`[Cache] RPC no existe o falló (${error.message}). Usando fallback.`);
    }

    // --- VERIFICAR NOMBRES DE TABLAS ---
    const [salesData, reviewsData, favoritesData] = await Promise.all([
      supabase
        .from('order_items')
        .select('quantity, price, orders!inner(status)')
        .eq('product_id', productId)
        .eq('orders.status', 'completado'),

      // ⚠️ VERIFICAR: ¿Es 'reviews' o 'product_reviews'?
      supabase
        .from('reviews') // ← O 'product_reviews'
        .select('rating')
        .eq('product_id', productId),

      // ⚠️ VERIFICAR: ¿Es 'favorites' o 'customer_favorites'?
      supabase
        .from('favorites') // ← O 'customer_favorites'
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
    ]);

    // Verificar errores en queries del fallback
    if (salesData.error) {
      console.error('[Cache] Error en salesData:', salesData.error);
      throw new Error(salesData.error.message);
    }
    if (reviewsData.error) {
      console.error('[Cache] Error en reviewsData:', reviewsData.error);
      throw new Error(reviewsData.error.message);
    }
    if (favoritesData.error) {
      console.error('[Cache] Error en favoritesData:', favoritesData.error);
      throw new Error(favoritesData.error.message);
    }

    // Calcular stats
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

  // RPC funcionó correctamente
  return { data, error: null };
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
