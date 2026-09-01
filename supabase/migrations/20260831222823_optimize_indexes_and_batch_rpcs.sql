-- ============================================================================
-- Migration: 20260831222823_optimize_indexes_and_batch_rpcs.sql
-- Description: Indices estrategicos + RPCs batch para panel de administracion
-- Author: Antigravity (ea-panel optimization)
-- ============================================================================

-- ============================================================================
-- SECCION 1: INDICES ESTRATEGICOS
-- ============================================================================

-- 1. TABLA: customers (Auth, Busquedas, Referidos)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON public.customers (phone);

CREATE INDEX IF NOT EXISTS idx_customers_referral_code
  ON public.customers (referral_code);

CREATE INDEX IF NOT EXISTS idx_customers_referrer_id
  ON public.customers (referrer_id)
  WHERE referrer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_created_at_desc
  ON public.customers (created_at DESC);

-- 2. TABLA: orders (Filtros KDS, Historial y Rango de Fechas Dashboard)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON public.orders (customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at);

CREATE INDEX IF NOT EXISTS idx_orders_order_code
  ON public.orders (order_code);

-- Indice compuesto para agregacion rapida de estadisticas por cliente
CREATE INDEX IF NOT EXISTS idx_orders_customer_stats
  ON public.orders (customer_id, status)
  INCLUDE (total_amount);

-- 3. TABLA: order_items (Detalle de ordenes y agregacion de productos)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);

-- 4. TABLA: products & product_images (Catalogo, Filtros y RLS)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_products_is_active_category
  ON public.products (is_active, category_id);

CREATE INDEX IF NOT EXISTS idx_products_name
  ON public.products (name);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id
  ON public.product_images (product_id);

-- 5. TABLA: special_prices (Promociones y Busquedas en Arreglos)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_special_prices_dates
  ON public.special_prices (start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_special_prices_product_id
  ON public.special_prices (product_id);

-- Indice GIN fundamental para consultar elementos dentro del arreglo UUID[]
CREATE INDEX IF NOT EXISTS idx_special_prices_target_customers_gin
  ON public.special_prices USING GIN (target_customer_ids);

-- 6. TABLA: discounts & usage (Validacion de Cupones)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_discounts_code_active
  ON public.discounts (code, is_active);

CREATE INDEX IF NOT EXISTS idx_discounts_specific_customer
  ON public.discounts (specific_customer_id)
  WHERE specific_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discount_usage_cust_disc
  ON public.customer_discount_usage (customer_id, discount_id);

-- 7. TABLAS RELACIONALES (Direcciones, Favoritos, Reviews, Terminos)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_customer_addresses_lookup
  ON public.customer_addresses (customer_id, is_default DESC);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_lookup
  ON public.customer_favorites (product_id);

CREATE INDEX IF NOT EXISTS idx_customer_terms_lookup
  ON public.customer_terms_acceptances (customer_id, terms_version_id);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id
  ON public.product_reviews (product_id);


-- ============================================================================
-- SECCION 2: FUNCIONES RPC BATCH
-- ============================================================================

-- RPC 1: get_customer_stats_batch
CREATE OR REPLACE FUNCTION public.get_customer_stats_batch(p_customer_ids uuid[])
RETURNS TABLE(
  customer_id      uuid,
  total_orders     bigint,
  completed_orders bigint,
  total_spent      numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id                                                                             AS customer_id,
    COUNT(o.id)::bigint                                                              AS total_orders,
    COUNT(o.id) FILTER (WHERE o.status = 'completado')::bigint                       AS completed_orders,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'completado'), 0)::numeric AS total_spent
  FROM unnest(p_customer_ids) AS c(id)
  LEFT JOIN public.orders o ON o.customer_id = c.id
  GROUP BY c.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_stats_batch(uuid[])
  TO anon, authenticated, service_role;


-- RPC 2: get_product_stats_batch
CREATE OR REPLACE FUNCTION public.get_product_stats_batch(p_product_ids uuid[])
RETURNS TABLE(
  product_id      uuid,
  total_sold      bigint,
  total_revenue   numeric,
  avg_rating      numeric,
  reviews_count   bigint,
  favorites_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH sales AS (
    SELECT
      oi.product_id,
      SUM(oi.quantity)::bigint             AS total_sold,
      SUM(oi.quantity * oi.price)::numeric AS total_revenue
    FROM public.order_items oi
    JOIN public.orders o
      ON o.id = oi.order_id
     AND o.status = 'completado'
    WHERE oi.product_id = ANY(p_product_ids)
    GROUP BY oi.product_id
  ),
  reviews AS (
    SELECT
      pr.product_id,
      ROUND(AVG(pr.rating), 1)::numeric AS avg_rating,
      COUNT(pr.product_id)::bigint       AS reviews_count
    FROM public.product_reviews pr
    WHERE pr.product_id = ANY(p_product_ids)
    GROUP BY pr.product_id
  ),
  favorites AS (
    SELECT
      cf.product_id,
      COUNT(cf.customer_id)::bigint AS favorites_count
    FROM public.customer_favorites cf
    WHERE cf.product_id = ANY(p_product_ids)
    GROUP BY cf.product_id
  )
  SELECT
    p.id                                    AS product_id,
    COALESCE(s.total_sold, 0)::bigint       AS total_sold,
    COALESCE(s.total_revenue, 0)::numeric   AS total_revenue,
    r.avg_rating::numeric                   AS avg_rating,
    COALESCE(r.reviews_count, 0)::bigint    AS reviews_count,
    COALESCE(f.favorites_count, 0)::bigint  AS favorites_count
  FROM unnest(p_product_ids) AS p(id)
  LEFT JOIN sales     s ON s.product_id = p.id
  LEFT JOIN reviews   r ON r.product_id = p.id
  LEFT JOIN favorites f ON f.product_id = p.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_stats_batch(uuid[])
  TO anon, authenticated, service_role;
