import { supabase } from '../../lib/supabaseClient';
import {
    normalizeBaseCatalog,
    normalizeSpecialPrices,
    PRODUCTS_WITH_IMAGES_SELECT,
} from './productUtils';

export const fetchBaseCatalog = async () => {
    let productsData = [];
    const [productsRpcRes, categoriesRes] = await Promise.all([
        supabase.rpc('get_active_menu_products'),
        supabase.from('categories').select('*'),
    ]);

    if (productsRpcRes.error) {
        console.warn('[ProductContext] RPC get_active_menu_products falló, usando fallback:', productsRpcRes.error);
        const fallbackRes = await supabase
            .from('products')
            .select(PRODUCTS_WITH_IMAGES_SELECT)
            .eq('is_active', true);
        if (fallbackRes.error) throw fallbackRes.error;
        productsData = fallbackRes.data || [];
    } else {
        productsData = productsRpcRes.data || [];
    }

    if (categoriesRes.error) throw categoriesRes.error;

    return normalizeBaseCatalog({
        products: productsData,
        categories: categoriesRes.data || [],
    });
};

export const fetchSpecialPrices = async (customerId) => {
    const today = new Date().toISOString().split('T')[0];
    let query = supabase
        .from('special_prices')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today);

    if (customerId) {
        query = query.or(`target_customer_ids.is.null,target_customer_ids.cs.{"${customerId}"}`);
    } else {
        query = query.is('target_customer_ids', null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return normalizeSpecialPrices(data || []);
};
