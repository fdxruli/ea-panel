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
  // Intentar RPC primero (más eficiente)
  const { data, error } = await supabase.rpc('get_product_stats_single', {
    p_product_id: productId
  });

  // Si la RPC devolvió datos exitosamente, retornar
  if (data && !error) {
    return { data, error: null };
  }

  // Si la RPC falló o no devolvió datos, usar fallback
  console.warn(`[useProductStats] RPC no disponible o falló para ${productId}. Usando fallback.`);
  if (error) {
    console.warn(`[useProductStats] Error de RPC:`, error.message);
  }

  try {
    // Fallback: Queries manuales
    const [salesData, reviewsData, favoritesData] = await Promise.all([
      // Total vendido (order_items de pedidos completados)
      supabase
        .from('order_items')
        .select('quantity, price, orders!inner(status)')
        .eq('product_id', productId)
        .eq('orders.status', 'completado'),
        
      // Reviews del producto
      supabase
        .from('product_reviews')
        .select('rating')
        .eq('product_id', productId),
        
      // Favoritos del producto
      supabase
        .from('customer_favorites')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
    ]);

    // Verificar errores en las queries
    if (salesData.error) throw new Error(`Error en salesData: ${salesData.error.message}`);
    if (reviewsData.error) throw new Error(`Error en reviewsData: ${reviewsData.error.message}`);
    if (favoritesData.error) throw new Error(`Error en favoritesData: ${favoritesData.error.message}`);

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
    
  } catch (fallbackError) {
    console.error(`[useProductStats] Error en fallback:`, fallbackError);
    // Retornar stats vacíos en lugar de fallar completamente
    return {
      data: {
        product_id: productId,
        total_sold: 0,
        total_revenue: 0,
        avg_rating: null,
        reviews_count: 0,
        favorites_count: 0
      },
      error: fallbackError
    };
  }
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
    () => fetchProductStats(productId),
    {
      ttl: DEFAULT_TTL.SHORT, // 1 minuto (stats cambian más frecuentemente)
      enabled: !!productId, // Solo ejecutar si hay productId
      ...options
    }
  );
};