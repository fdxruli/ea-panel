import { supabase } from '../../lib/supabaseClient';

export const fetchCustomerAndAddresses = async (phoneNumber, expectedCustomerId) => {
    const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('id, name, phone, created_at, referral_code, referrer_id, referral_count')
        .eq('phone', phoneNumber)
        .maybeSingle();

    if (customerError) throw customerError;
    if (!customerData) return { customer: null, addresses: [] };
    if (expectedCustomerId && customerData.id !== expectedCustomerId) {
        const identityError = new Error('Canonical customer changed while loading user data.');
        identityError.code = 'CANONICAL_ID_CHANGED';
        throw identityError;
    }

    const { data: addressesData, error: addressesError } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerData.id)
        .order('is_default', { ascending: false });

    if (addressesError) throw addressesError;

    return { customer: customerData, addresses: addressesData || [] };
};

export const fetchOrders = async (customerId) => {
    const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, order_items(*, products(*))')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;
    return ordersData || [];
};
