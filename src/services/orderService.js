/**
 * Pure customer order service. Auth/RLS is the ownership boundary.
 */
export const createOrder = async (supabase, params) => {
  const { totalAmount, scheduledFor, cartItems, notes } = params;
  const p_cart_items = cartItems.map((item) => ({
    product_id: item.id,
    quantity: item.quantity,
    price: item.price,
    cost: item.cost || 0,
  }));

  const { data, error } = await supabase.rpc('create_my_order_with_stock_check', {
    p_total_amount: totalAmount,
    p_scheduled_for: scheduledFor,
    p_cart_items,
    p_notes: notes || null,
  });

  if (error) return { ok: false, order: null, error };
  if (!data?.[0]) return { ok: false, order: null, error: new Error('No se pudo crear el pedido en este momento.') };
  return { ok: true, order: data[0], error: null };
};

export const deactivateSingleUseDiscount = async (supabase, params) => {
  const { discountId } = params;
  const { error } = await supabase.rpc('record_my_discount_usage_and_deactivate', {
    p_discount_id: discountId,
  });
  if (error) {
    console.warn('Warning deactivating discount (non-fatal):', error);
    return { ok: false, error };
  }
  return { ok: true, error: null };
};

const TIMEOUT_ERROR_NAME = 'TimeoutError';
export const isNetworkRequestError = (error) => {
  if (!error) return false;
  if (error.name === TIMEOUT_ERROR_NAME || error.code === 'TIMEOUT_ERROR') return true;
  const message = typeof error?.message === 'string' ? error.message : '';
  return error instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message);
};

export const NETWORK_BLOCKED_MESSAGE = 'Se necesita una conexión estable para continuar con tu pedido.';
export const NETWORK_SUBMIT_ERROR_MESSAGE = 'La conexión falló o es muy lenta. Tu pedido NO se procesó. Por favor, intenta de nuevo.';
