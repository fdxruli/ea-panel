import { supabase } from '../lib/supabaseClient';
import { calculateLoyaltyCategory } from '../lib/loyalty';

export async function getCustomerLoyaltyCategory(customerId) {
    if (!customerId) {
        return { data: null, error: null, code: 'unauthenticated' };
    }

    try {
        const { data, error } = await supabase
            .from('orders')
            .select('id, total_amount, created_at, status')
            .eq('customer_id', customerId)
            .eq('status', 'completado');

        if (error) {
            return { data: null, error, code: 'loyalty_lookup_failed' };
        }

        const completed = data || [];
        const totalSpent = completed.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        const completedOrders = completed.length;
        let lastOrderDate = null;
        if (completed.length > 0) {
            const dates = completed.map(o => new Date(o.created_at).getTime()).filter(t => !isNaN(t));
            if (dates.length > 0) {
                lastOrderDate = new Date(Math.max(...dates)).toISOString();
            }
        }

        const category = calculateLoyaltyCategory({
            totalSpent,
            completedOrders,
            lastOrderDate,
        });

        return {
            data: {
                category,
                total_spent: totalSpent,
                completed_orders: completedOrders,
                last_order_date: lastOrderDate,
            },
            error: null,
            code: 'ok',
        };
    } catch (err) {
        return { data: null, error: err, code: 'loyalty_error' };
    }
}
