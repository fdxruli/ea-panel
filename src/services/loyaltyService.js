import { supabase } from '../lib/supabaseClient';
import { LOYALTY_CATEGORIES } from '../lib/loyalty';

const DEFAULT_LOYALTY = Object.freeze({
    category: LOYALTY_CATEGORIES.INICIAL,
    benefit_label: 'Comienza a disfrutar de nuestras promociones.',
    condition_label: 'Nivel Inicial.',
});

export async function getCustomerLoyaltyCategory() {
    try {
        const { data, error } = await supabase.rpc('get_my_loyalty_category');

        if (error) {
            console.warn('[loyaltyService] Error recuperando categoría RPC:', error.message);
            return {
                data: DEFAULT_LOYALTY,
                error,
                code: 'loyalty_rpc_failed',
            };
        }

        const row = Array.isArray(data) ? data[0] : data;
        const category = row?.category || LOYALTY_CATEGORIES.INICIAL;

        return {
            data: {
                category,
                benefit_label: row?.benefit_label || DEFAULT_LOYALTY.benefit_label,
                condition_label: row?.condition_label || DEFAULT_LOYALTY.condition_label,
            },
            error: null,
            code: 'ok',
        };
    } catch (err) {
        console.warn('[loyaltyService] Error inesperado en lealtad:', err);
        return {
            data: DEFAULT_LOYALTY,
            error: err,
            code: 'loyalty_error',
        };
    }
}
