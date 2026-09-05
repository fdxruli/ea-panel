/**
 * src/lib/productAdminQueries.js
 * 
 * Funciones optimizadas para el módulo de administración de productos y catálogo.
 * Soporta directorio con filtros, orden y paginación en servidor, KPIs globales y analítica 360°.
 * 
 * @module productAdminQueries
 */

import { supabase } from './supabaseClient';

export const ADMIN_PRODUCTS_KPIS_CACHE_KEY = 'admin:products:kpis';

/**
 * Genera una llave de caché unívoca para el directorio de productos.
 * @param {Object} params 
 * @returns {string}
 */
export const getProductsDirectoryCacheKey = (params = {}) => {
  const {
    search = '',
    categoryId = 'all',
    status = 'all',
    stockStatus = 'all',
    menuMatrix = 'all',
    sortBy = 'sales_desc',
    audience = 'all',
    limit = 50,
    offset = 0
  } = params;

  return `admin:products:dir:${search.trim().toLowerCase()}:${categoryId}:${status}:${stockStatus}:${menuMatrix}:${sortBy}:${audience}:${limit}:${offset}`;
};

/**
 * Genera la llave de caché para el detalle analítico de un producto.
 * @param {string} productId 
 * @returns {string}
 */
export const getProductDetailCacheKey = (productId) => `admin:product:detail:${productId}`;

/**
 * Obtiene el directorio administrativo de productos con filtros, orden y paginación en servidor.
 * 
 * @param {Object} [options]
 * @param {string} [options.search='']
 * @param {string} [options.categoryId=null]
 * @param {string} [options.status='all'] - 'all' | 'active' | 'inactive'
 * @param {string} [options.stockStatus='all'] - 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'untracked'
 * @param {string} [options.menuMatrix='all'] - 'all' | 'star' | 'workhorse' | 'puzzle' | 'dog'
 * @param {string} [options.sortBy='sales_desc'] - 'sales_desc' | 'revenue_desc' | 'margin_desc' | 'price_desc' | 'price_asc' | 'stock_asc' | 'name_asc'
 * @param {string} [options.audience='all'] - 'all' | 'public' | 'special'
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @returns {Promise<{products: Array, totalCount: number}>}
 */
export const fetchAdminProductsDirectory = async ({
  search = '',
  categoryId = null,
  status = 'all',
  stockStatus = 'all',
  menuMatrix = 'all',
  sortBy = 'sales_desc',
  audience = 'all',
  limit = 50,
  offset = 0
} = {}) => {
  const cleanSearch = search ? search.trim() : null;
  const cleanCategory = categoryId && categoryId !== 'all' ? categoryId : null;

  const { data, error } = await supabase.rpc('get_admin_products_directory', {
    p_search: cleanSearch,
    p_category_id: cleanCategory,
    p_status: status || 'all',
    p_stock_status: stockStatus || 'all',
    p_menu_matrix: menuMatrix || 'all',
    p_sort_by: sortBy || 'sales_desc',
    p_limit: limit,
    p_offset: offset,
    p_audience: audience || 'all'
  });

  if (error) {
    console.error('[productAdminQueries] Error en fetchAdminProductsDirectory:', error);
    throw error;
  }

  const products = (data || []).map(p => ({
    ...p,
    price: Number(p.price || 0),
    cost: Number(p.cost || 0),
    effective_cost: Number(p.effective_cost || 0),
    margin_amount: Number(p.margin_amount || 0),
    margin_percent: Number(p.margin_percent || 0),
    total_sold: Number(p.total_sold || 0),
    total_revenue: Number(p.total_revenue || 0),
    avg_rating: p.avg_rating !== null && p.avg_rating !== undefined ? Number(p.avg_rating) : null,
    reviews_count: Number(p.reviews_count || 0),
    favorites_count: Number(p.favorites_count || 0),
    image_count: Number(p.image_count || 1),
    max_preparable: p.max_preparable !== null && p.max_preparable !== undefined ? Number(p.max_preparable) : null,
    target_customer_ids: p.target_customer_ids || null,
    target_customers_count: Number(p.target_customers_count || 0),
    is_exclusive: Boolean(p.is_exclusive),
    total_count: Number(p.total_count || 0)
  }));

  const totalCount = products.length > 0 ? products[0].total_count : 0;

  return { products, totalCount };
};

/**
 * Actualiza de forma atómica y rápida la audiencia de clientes para un producto.
 * @param {string} productId 
 * @param {string[]|null} targetCustomerIds 
 * @returns {Promise<boolean>}
 */
export const updateProductAudience = async (productId, targetCustomerIds = null) => {
  if (!productId) throw new Error('Product ID is required');

  const { data, error } = await supabase.rpc('update_product_audience', {
    p_product_id: productId,
    p_target_customer_ids: targetCustomerIds && targetCustomerIds.length > 0 ? targetCustomerIds : null
  });

  if (error) {
    console.error('[productAdminQueries] Error en updateProductAudience:', error);
    throw error;
  }

  return data;
};

/**
 * Obtiene los KPIs globales del catálogo y salud comercial del menú.
 * 
 * @returns {Promise<Object>}
 */
export const fetchAdminProductsKPIs = async () => {
  const { data, error } = await supabase.rpc('get_admin_products_kpis');

  if (error) {
    console.error('[productAdminQueries] Error en fetchAdminProductsKPIs:', error);
    throw error;
  }

  const kpis = data || {};
  return {
    total_products: Number(kpis.total_products || 0),
    active_products: Number(kpis.active_products || 0),
    inactive_products: Number(kpis.inactive_products || 0),
    total_categories: Number(kpis.total_categories || 0),
    total_catalog_revenue: Number(kpis.total_catalog_revenue || 0),
    total_units_sold: Number(kpis.total_units_sold || 0),
    avg_profit_margin: Number(kpis.avg_profit_margin || 0),
    out_of_stock_count: Number(kpis.out_of_stock_count || 0),
    low_stock_count: Number(kpis.low_stock_count || 0),
    untracked_stock_count: Number(kpis.untracked_stock_count || 0),
    star_count: Number(kpis.star_count || 0),
    workhorse_count: Number(kpis.workhorse_count || 0),
    puzzle_count: Number(kpis.puzzle_count || 0),
    dog_count: Number(kpis.dog_count || 0),
    top_seller: kpis.top_seller || null
  };
};

/**
 * Obtiene el expediente 360° analítico de un producto (receta en vivo, top clientes, ventas 30d, pedidos recientes y reseñas).
 * 
 * @param {string} productId 
 * @returns {Promise<Object|null>}
 */
export const fetchAdminProductDetailAnalytics = async (productId) => {
  if (!productId) return null;

  const { data, error } = await supabase.rpc('get_admin_product_detail_analytics', {
    p_product_id: productId
  });

  if (error) {
    console.error('[productAdminQueries] Error en fetchAdminProductDetailAnalytics:', error);
    throw error;
  }

  if (!data) return null;

  return {
    product: data.product || null,
    recipe: (data.recipe || []).map(r => ({
      ...r,
      average_cost: Number(r.average_cost || 0),
      current_stock: Number(r.current_stock || 0),
      low_stock_threshold: Number(r.low_stock_threshold || 0),
      quantity_used: Number(r.quantity_used || 0),
      ingredient_cost_in_dish: Number(r.ingredient_cost_in_dish || 0),
      preparable_units: r.preparable_units !== null ? Number(r.preparable_units) : null
    })),
    top_customers: (data.top_customers || []).map(c => ({
      ...c,
      total_qty: Number(c.total_qty || 0),
      total_spent: Number(c.total_spent || 0)
    })),
    recent_orders: (data.recent_orders || []).map(o => ({
      ...o,
      quantity: Number(o.quantity || 0),
      unit_price: Number(o.unit_price || 0),
      total_item_amount: Number(o.total_item_amount || 0)
    })),
    sales_summary_30d: {
      units_sold_30d: Number(data.sales_summary_30d?.units_sold_30d || 0),
      revenue_30d: Number(data.sales_summary_30d?.revenue_30d || 0),
      orders_count_30d: Number(data.sales_summary_30d?.orders_count_30d || 0)
    },
    reviews: data.reviews || [],
    assigned_customers: data.assigned_customers || []
  };
};
