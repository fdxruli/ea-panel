import { supabase } from './supabaseClient';

const CLIENT_BASIC_PRODUCT_FIELDS = `
  id,
  name,
  description,
  price,
  image_url,
  category_id,
  is_active
`;

const ADMIN_BASIC_PRODUCT_FIELDS = `
  id,
  name,
  description,
  price,
  cost,
  image_url,
  category_id,
  is_active
`;

const buildBasicProductsQuery = ({ activeOnly = false, includeCost = false } = {}) => {
  let query = supabase
    .from('products')
    .select(includeCost ? ADMIN_BASIC_PRODUCT_FIELDS : CLIENT_BASIC_PRODUCT_FIELDS)
    .order('name');

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  return query;
};

export const fetchAdminBasicProducts = () =>
  buildBasicProductsQuery({ includeCost: true });

export const fetchClientBasicProducts = () =>
  buildBasicProductsQuery({ activeOnly: true });

/**
 * Obtiene stats de múltiples productos en una sola llamada RPC.
 * Evita hacer N llamadas individuales cuando se necesitan stats para varios productos.
 *
 * @param {string[]} productIds - Array de IDs de productos
 * @returns {Promise<Array>} Array de stats por producto
 */
export const fetchProductStatsBatch = async (productIds) => {
  if (!productIds || productIds.length === 0) {
    return [];
  }

  // Si es un solo producto, usar la RPC individual (más eficiente)
  if (productIds.length === 1) {
    const { data, error } = await supabase.rpc('get_product_stats_single', {
      p_product_id: productIds[0]
    });
    if (error) throw error;
    return data || [];
  }

  // Para múltiples productos, intentar la RPC batch primero
  const { data, error } = await supabase.rpc('get_product_stats_batch', {
    p_product_ids: productIds
  });

  if (error) {
    // Fallback: si la RPC batch no existe, hacer llamadas individuales con concurrencia limitada
    console.warn('[productQueries] RPC batch no disponible, usando fallback con concurrencia limitada');
    return fetchProductStatsBatchFallback(productIds);
  }

  return data || [];
};

/**
 * Fallback con concurrencia limitada para cuando no existe la RPC batch.
 * @param {string[]} productIds
 * @returns {Promise<Array>}
 */
const fetchProductStatsBatchFallback = async (productIds) => {
  const MAX_CONCURRENT = 5; // Máximo 5 peticiones simultáneas
  const results = [];

  for (let i = 0; i < productIds.length; i += MAX_CONCURRENT) {
    const batch = productIds.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map(productId =>
        supabase.rpc('get_product_stats_single', { p_product_id: productId })
          .then(({ data, error }) => {
            if (error) {
              console.error(`[productQueries] Error en stats de producto ${productId}:`, error);
              return null;
            }
            return data?.[0] || null;
          })
      )
    );
    results.push(...batchResults.filter(Boolean));
  }

  return results;
};

/**
 * Obtiene stats básicos de un solo producto (para uso individual).
 * @param {string} productId
 * @returns {Promise<Object|null>}
 */
export const fetchProductStatsSingle = async (productId) => {
  const { data, error } = await supabase.rpc('get_product_stats_single', {
    p_product_id: productId
  });

  if (error) throw error;
  return data?.[0] || null;
};
