/**
 * orderService.js
 * Pure service functions for order creation and discount management via Supabase.
 * Receives the supabase client as a dependency to remain testable.
 */

/**
 * Creates an order via the Supabase RPC function.
 *
 * @param {object} supabase - Supabase client instance
 * @param {object} params
 * @param {string} params.customerId
 * @param {number} params.totalAmount
 * @param {string|null} params.scheduledFor - ISO string or null
 * @param {Array} params.cartItems - [{ product_id, quantity, price, cost }]
 * @returns {{ ok: boolean, order: object|null, error: Error|null }}
 */
export const createOrder = async (supabase, params) => {
  const { customerId, totalAmount, scheduledFor, cartItems, notes } = params;

  const p_cart_items = cartItems.map((item) => ({
    product_id: item.id,
    quantity: item.quantity,
    price: item.price,
    cost: item.cost || 0,
  }));

  const { data, error } = await supabase.rpc('create_order_with_stock_check', {
    p_customer_id: customerId,
    p_total_amount: totalAmount,
    p_scheduled_for: scheduledFor,
    p_cart_items,
    p_notes: notes || null,
  });

  if (error) {
    return { ok: false, order: null, error };
  }

  if (!data?.[0]) {
    return {
      ok: false,
      order: null,
      error: new Error('No se pudo crear el pedido en este momento.'),
    };
  }

  return { ok: true, order: data[0], error: null };
};

/**
 * Records discount usage and deactivates a single-use discount.
 *
 * @param {object} supabase - Supabase client instance
 * @param {object} params
 * @param {string} params.customerId
 * @param {string} params.discountId
 * @returns {{ ok: boolean, error: Error|null }}
 */
export const deactivateSingleUseDiscount = async (supabase, params) => {
  const { customerId, discountId } = params;

  const { error } = await supabase.rpc('record_discount_usage_and_deactivate', {
    p_customer_id: customerId,
    p_discount_id: discountId,
  });

  if (error) {
    console.warn('Warning deactivating discount (non-fatal):', error);
    return { ok: false, error };
  }

  return { ok: true, error: null };
};

/**
 * Network error detection utility (extracted from the original component).
 *
 * @param {Error} error
 * @returns {boolean}
 */
const TIMEOUT_ERROR_NAME = 'TimeoutError';

export const isNetworkRequestError = (error) => {
  if (!error) return false;

  if (
    error.name === TIMEOUT_ERROR_NAME ||
    error.code === 'TIMEOUT_ERROR'
  ) {
    return true;
  }

  const message = typeof error?.message === 'string' ? error.message : '';

  return (
    error instanceof TypeError ||
    /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message)
  );
};

export const NETWORK_BLOCKED_MESSAGE =
  'Se necesita una conexión estable para continuar con tu pedido.';

export const NETWORK_SUBMIT_ERROR_MESSAGE =
  'La conexión falló o es muy lenta. Tu pedido NO se procesó. Por favor, intenta de nuevo.';
