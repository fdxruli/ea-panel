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
    // Fallback: si la RPC batch no existe, hacer llamadas individuales con concurrencia limitada
    console.warn('[customerQueries] RPC batch no disponible, usando fallback con concurrencia limitada');
    return fetchCustomerStatsBatchFallback(customerIds);
  }

  return data || [];
};

/**
 * Fallback con concurrencia limitada para cuando no existe la RPC batch.
 * @param {string[]} customerIds 
 * @returns {Promise<Array>}
 */
const fetchCustomerStatsBatchFallback = async (customerIds) => {
  const MAX_CONCURRENT = 5; // Máximo 5 peticiones simultáneas
  const results = [];
  
  for (let i = 0; i < customerIds.length; i += MAX_CONCURRENT) {
    const batch = customerIds.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map(customerId => 
        supabase.rpc('get_customer_basic_stats', { p_customer_id: customerId })
          .then(({ data, error }) => {
            if (error) {
              console.error(`[customerQueries] Error en stats de cliente ${customerId}:`, error);
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
