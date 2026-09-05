-- ============================================================================
-- Migration: 20260904193000_customer_directory_and_crm_analytics.sql
-- Description: RPCs de alto rendimiento para directorio de clientes,
--              ordenamiento en servidor (LTV, compras, recencia),
--              segmentacion RFM, KPIs globales y productos favoritos.
-- Author: Antigravity
-- ============================================================================

-- 1. RPC: Directorio Administrativo de Clientes con Ordenamiento y Segmentación
CREATE OR REPLACE FUNCTION public.get_admin_customers_directory(
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'spent_desc',
  p_segment text DEFAULT 'all',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  referral_code text,
  created_at timestamptz,
  total_orders bigint,
  completed_orders bigint,
  total_spent numeric,
  last_order_date timestamptz,
  avg_ticket numeric,
  customer_segment text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH cust_stats AS (
    SELECT 
      c.id,
      c.name::text AS name,
      c.phone::text AS phone,
      c.referral_code::text AS referral_code,
      c.created_at,
      COALESCE(COUNT(o.id), 0)::bigint AS total_orders,
      COALESCE(COUNT(o.id) FILTER (WHERE o.status = 'completado'), 0)::bigint AS completed_orders,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'completado'), 0)::numeric AS total_spent,
      MAX(o.created_at) AS last_order_date
    FROM public.customers c
    LEFT JOIN public.orders o ON o.customer_id = c.id
    GROUP BY c.id, c.name, c.phone, c.referral_code, c.created_at
  ),
  enriched AS (
    SELECT 
      *,
      CASE 
        WHEN completed_orders > 0 THEN ROUND(total_spent / completed_orders, 2)
        ELSE 0 
      END AS avg_ticket,
      CASE 
        WHEN total_spent >= 3000 OR completed_orders >= 15 THEN 'VIP'
        WHEN completed_orders >= 4 AND last_order_date >= NOW() - INTERVAL '45 days' THEN 'Frecuente'
        WHEN completed_orders >= 2 AND last_order_date < NOW() - INTERVAL '45 days' THEN 'En Riesgo'
        WHEN completed_orders <= 1 AND created_at >= NOW() - INTERVAL '30 days' THEN 'Nuevo'
        ELSE 'Inactivo'
      END AS customer_segment
    FROM cust_stats
  ),
  filtered AS (
    SELECT *
    FROM enriched
    WHERE (
      p_search IS NULL OR p_search = '' 
      OR name ILIKE '%' || p_search || '%' 
      OR phone ILIKE '%' || p_search || '%'
    )
    AND (
      p_segment IS NULL OR p_segment = 'all' OR p_segment = ''
      OR REPLACE(LOWER(customer_segment), ' ', '_') = REPLACE(LOWER(p_segment), ' ', '_')
    )
  ),
  counted AS (
    SELECT *, COUNT(*) OVER()::bigint AS total_count
    FROM filtered
  )
  SELECT 
    id,
    name,
    phone,
    referral_code,
    created_at,
    total_orders,
    completed_orders,
    total_spent,
    last_order_date,
    avg_ticket,
    customer_segment,
    total_count
  FROM counted
  ORDER BY 
    CASE WHEN p_sort_by = 'spent_desc' THEN total_spent END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'spent_asc' THEN total_spent END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'orders_desc' THEN completed_orders END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'orders_asc' THEN completed_orders END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'last_order_desc' THEN last_order_date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'last_order_asc' THEN last_order_date END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'created_desc' THEN created_at END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'created_asc' THEN created_at END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'name_asc' THEN LOWER(name) END ASC NULLS LAST,
    total_spent DESC, completed_orders DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_customers_directory(text, text, text, int, int)
  TO anon, authenticated, service_role;


-- 2. RPC: Indicadores Globales Reales (KPIs)
CREATE OR REPLACE FUNCTION public.get_admin_customer_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH cust_stats AS (
    SELECT 
      c.id,
      c.created_at,
      COALESCE(COUNT(o.id), 0) AS total_orders,
      COALESCE(COUNT(o.id) FILTER (WHERE o.status = 'completado'), 0) AS completed_orders,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'completado'), 0)::numeric AS total_spent,
      MAX(o.created_at) AS last_order_date
    FROM public.customers c
    LEFT JOIN public.orders o ON o.customer_id = c.id
    GROUP BY c.id, c.created_at
  ),
  segmented AS (
    SELECT 
      *,
      CASE 
        WHEN total_spent >= 3000 OR completed_orders >= 15 THEN 'VIP'
        WHEN completed_orders >= 4 AND last_order_date >= NOW() - INTERVAL '45 days' THEN 'Frecuente'
        WHEN completed_orders >= 2 AND last_order_date < NOW() - INTERVAL '45 days' THEN 'En Riesgo'
        WHEN completed_orders <= 1 AND created_at >= NOW() - INTERVAL '30 days' THEN 'Nuevo'
        ELSE 'Inactivo'
      END AS segment
    FROM cust_stats
  )
  SELECT jsonb_build_object(
    'total_customers', COUNT(*),
    'active_customers', COUNT(*) FILTER (WHERE completed_orders > 0),
    'total_revenue', COALESCE(SUM(total_spent), 0),
    'global_avg_ticket', CASE 
      WHEN SUM(completed_orders) > 0 THEN ROUND(SUM(total_spent) / SUM(completed_orders), 2)
      ELSE 0 
    END,
    'vip_count', COUNT(*) FILTER (WHERE segment = 'VIP'),
    'frequent_count', COUNT(*) FILTER (WHERE segment = 'Frecuente'),
    'at_risk_count', COUNT(*) FILTER (WHERE segment = 'En Riesgo'),
    'new_count', COUNT(*) FILTER (WHERE segment = 'Nuevo'),
    'inactive_count', COUNT(*) FILTER (WHERE segment = 'Inactivo')
  )
  FROM segmented;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_customer_kpis()
  TO anon, authenticated, service_role;


-- 3. RPC: Productos Favoritos / Más Pedidos por Cliente
CREATE OR REPLACE FUNCTION public.get_customer_favorite_products(
  p_customer_id uuid,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  total_qty bigint,
  total_spent numeric,
  last_ordered_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    oi.product_id,
    COALESCE(p.name, 'Producto')::text AS product_name,
    SUM(oi.quantity)::bigint AS total_qty,
    SUM(oi.price * oi.quantity)::numeric AS total_spent,
    MAX(o.created_at) AS last_ordered_at
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE o.customer_id = p_customer_id
    AND o.status = 'completado'
  GROUP BY oi.product_id, p.name
  ORDER BY total_qty DESC, total_spent DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_favorite_products(uuid, int)
  TO anon, authenticated, service_role;
