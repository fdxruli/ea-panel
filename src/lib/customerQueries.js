/**
 * Funciones optimizadas para obtener datos de clientes.
 * Incluye funciones batch para evitar múltiples llamadas RPC.
 */

import { supabase } from './supabaseClient';

const BASIC_CUSTOMER_FIELDS = `
  id,
  name,
  phone,
  referral_code,
  referral_count,
  created_at
`;

/**
 * Obtiene datos básicos de todos los clientes.
 * @returns {Promise<Array>}
 */
export const fetchBasicCustomers = async () => {
  return await supabase
    .from('customers')
    .select(BASIC_CUSTOMER_FIELDS)
    .order('created_at', { ascending: false })
    .limit(500);
};

/**
 * Obtiene stats básicos de múltiples clientes en una sola llamada RPC.
 * 
 * @param {string[]} customerIds - Array de IDs de clientes
 * @returns {Promise<Array>} Array de stats por cliente
 */
export const fetchCustomerStatsBatch = async (customerIds) => {
  if (!customerIds || customerIds.length === 0) {
    return [];
  }

  // Si es un solo cliente, usar la RPC individual
  if (customerIds.length === 1) {
    const { data, error } = await supabase.rpc('get_customer_basic_stats', {
      p_customer_id: customerIds[0]
    });
    if (error) throw error;
    return data || [];
  }

  // Para múltiples clientes, intentar la RPC batch
  const { data, error } = await supabase.rpc('get_customer_stats_batch', {
    p_customer_ids: customerIds
  });

  if (error) {
    console.error('[customerQueries] Error al obtener stats en batch:', error);
    throw error;
  }

  return data || [];
};

/**
 * Obtiene stats básicos de un solo cliente.
 * @param {string} customerId 
 * @returns {Promise<Object|null>}
 */
export const fetchCustomerStatsSingle = async (customerId) => {
  const { data, error } = await supabase.rpc('get_customer_basic_stats', {
    p_customer_id: customerId
  });
  
  if (error) throw error;
  return data?.[0] || null;
};

/**
 * Obtiene pedidos de un cliente específico (para historial).
 * @param {string} customerId 
 * @param {number} limit - Límite de pedidos a retornar (default: 50)
 * @returns {Promise<Array>}
 */
export const fetchCustomerOrders = async (customerId, limit = 50) => {
  return await supabase
    .from('orders')
    .select(`
      id,
      order_code,
      status,
      total_amount,
      created_at,
      updated_at,
      cancellation_reason
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);
};

/**
 * Obtiene direcciones de un cliente.
 * @param {string} customerId 
 * @returns {Promise<Array>}
 */
export const fetchCustomerAddresses = async (customerId) => {
  return await supabase
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false });
};

/**
 * Obtiene el directorio de clientes con stats, ordenamiento en servidor y segmentación.
 * @param {Object} options
 * @param {string} [options.search]
 * @param {string} [options.sortBy] - 'spent_desc' | 'orders_desc' | 'last_order_desc' | 'created_desc' | 'name_asc'
 * @param {string} [options.segment] - 'all' | 'vip' | 'frecuente' | 'en_riesgo' | 'nuevo' | 'inactivo'
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @returns {Promise<{customers: Array, totalCount: number}>}
 */
export const fetchCustomerDirectory = async ({
  search = '',
  sortBy = 'spent_desc',
  segment = 'all',
  limit = 50,
  offset = 0
} = {}) => {
  const { data, error } = await supabase.rpc('get_admin_customers_directory', {
    p_search: search.trim() || null,
    p_sort_by: sortBy,
    p_segment: segment,
    p_limit: limit,
    p_offset: offset
  });

  if (error) {
    console.error('[customerQueries] Error en fetchCustomerDirectory:', error);
    throw error;
  }

  const customers = (data || []).map(c => ({
    ...c,
    totalOrders: Number(c.total_orders || 0),
    completedOrders: Number(c.completed_orders || 0),
    totalSpent: Number(c.total_spent || 0),
    avgTicket: Number(c.avg_ticket || 0)
  }));
  const totalCount = customers.length > 0 ? Number(customers[0].total_count) : 0;

  return { customers, totalCount };
};

/**
 * Obtiene los KPIs globales reales de clientes de todo el negocio.
 * @returns {Promise<Object>}
 */
export const fetchCustomerGlobalKPIs = async () => {
  const { data, error } = await supabase.rpc('get_admin_customer_kpis');
  if (error) {
    console.error('[customerQueries] Error en fetchCustomerGlobalKPIs:', error);
    throw error;
  }
  return data || {};
};

/**
 * Obtiene los productos favoritos / más pedidos de un cliente.
 * @param {string} customerId
 * @param {number} [limit=5]
 * @returns {Promise<Array>}
 */
export const fetchCustomerFavoriteProducts = async (customerId, limit = 5) => {
  if (!customerId) return [];
  const { data, error } = await supabase.rpc('get_customer_favorite_products', {
    p_customer_id: customerId,
    p_limit: limit
  });
  if (error) {
    console.error('[customerQueries] Error en fetchCustomerFavoriteProducts:', error);
    throw error;
  }
  return data || [];
};
