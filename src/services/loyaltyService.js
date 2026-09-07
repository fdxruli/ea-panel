import { supabase } from '../lib/supabaseClient';

export async function getMyLoyaltyCategory() {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
        return { data: null, error: userError, code: 'auth_lookup_failed' };
    }

    if (!user) {
        return { data: null, error: null, code: 'unauthenticated' };
    }

    const { data, error } = await supabase.rpc('get_my_loyalty_category');
    if (error) {
        return { data: null, error, code: 'loyalty_lookup_failed' };
    }

    if (!data?.length) {
        return { data: null, error: null, code: 'customer_not_linked' };
    }

    return { data: data[0], error: null, code: 'ok' };
}
