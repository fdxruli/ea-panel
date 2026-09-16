-- ============================================================================
-- Migración: Fase 1C + 1D — Hardening de Funciones Administrativas y Seguridad
-- Fecha: 2026-09-15
-- 
-- 1C: Incorporar comprobación estricta is_admin() en RPCs administrativas
-- 1D: Fijar search_path en get_my_loyalty_category, revocar extensiones HTTP
--     a anon/public y corregir política de descuentos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_admin_customers_directory
-- ----------------------------------------------------------------------------
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  RETURN QUERY
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
    counted.id,
    counted.name,
    counted.phone,
    counted.referral_code,
    counted.created_at,
    counted.total_orders,
    counted.completed_orders,
    counted.total_spent,
    counted.last_order_date,
    counted.avg_ticket,
    counted.customer_segment,
    counted.total_count
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_customers_directory(text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_customers_directory(text, text, text, int, int) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. get_admin_customer_kpis
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_customer_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

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
  ) INTO v_result
  FROM segmented;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_customer_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_customer_kpis() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. get_admin_products_directory
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_products_directory(
  p_search text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_stock_status text DEFAULT 'all',
  p_menu_matrix text DEFAULT 'all',
  p_sort_by text DEFAULT 'sales_desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_audience text DEFAULT 'all'
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  price numeric,
  cost numeric,
  effective_cost numeric,
  margin_amount numeric,
  margin_percent numeric,
  image_url text,
  category_id uuid,
  category_name text,
  is_active boolean,
  track_stock boolean,
  created_at timestamptz,
  total_sold bigint,
  total_revenue numeric,
  avg_rating numeric,
  reviews_count bigint,
  favorites_count bigint,
  stock_status text,
  max_preparable integer,
  menu_matrix_class text,
  image_count bigint,
  target_customer_ids uuid[],
  target_customers_count integer,
  is_exclusive boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  RETURN QUERY
  WITH recipe_stats AS (
    SELECT
      rec.product_id,
      COUNT(*)::bigint AS ingredients_count,
      COALESCE(SUM(rec.quantity_used * COALESCE(ing.average_cost, 0)), 0)::numeric AS recipe_cost,
      MIN(
        CASE 
          WHEN rec.deduct_stock_automatically = true AND ing.track_inventory = true 
          THEN FLOOR(ing.current_stock / NULLIF(rec.quantity_used, 0))::integer
          ELSE NULL 
        END
      ) AS min_preparable,
      BOOL_OR(
        rec.deduct_stock_automatically = true 
        AND ing.track_inventory = true 
        AND (ing.current_stock < rec.quantity_used OR ing.current_stock <= 0)
      ) AS is_out_of_stock,
      BOOL_OR(
        rec.deduct_stock_automatically = true 
        AND ing.track_inventory = true 
        AND ing.current_stock > 0 
        AND ing.current_stock <= COALESCE(ing.low_stock_threshold, 5)
      ) AS is_low_stock
    FROM public.product_recipes rec
    JOIN public.ingredients ing ON ing.id = rec.ingredient_id
    GROUP BY rec.product_id
  ),
  sales_stats AS (
    SELECT
      oi.product_id,
      COALESCE(SUM(oi.quantity), 0)::bigint AS total_sold,
      COALESCE(SUM(oi.quantity * oi.price), 0)::numeric AS total_revenue
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'completado'
    GROUP BY oi.product_id
  ),
  review_stats AS (
    SELECT
      pr.product_id,
      ROUND(AVG(pr.rating), 2) AS avg_rating,
      COUNT(*)::bigint AS reviews_count
    FROM public.product_reviews pr
    GROUP BY pr.product_id
  ),
  fav_stats AS (
    SELECT
      cf.product_id,
      COUNT(*)::bigint AS favorites_count
    FROM public.customer_favorites cf
    GROUP BY cf.product_id
  ),
  img_stats AS (
    SELECT
      pi.product_id,
      COUNT(*)::bigint AS additional_images
    FROM public.product_images pi
    GROUP BY pi.product_id
  ),
  catalog_benchmarks AS (
    SELECT
      COALESCE(AVG(total_sold), 0)::numeric AS avg_sold,
      COALESCE(AVG(margin_percent), 0)::numeric AS avg_margin
    FROM (
      SELECT
        p.id,
        COALESCE(ss.total_sold, 0) AS total_sold,
        CASE
          WHEN p.price > 0 THEN 
            ((p.price - CASE WHEN p.track_stock = true AND rs.recipe_cost > 0 THEN rs.recipe_cost ELSE COALESCE(p.cost, 0) END) / p.price) * 100
          ELSE 0
        END AS margin_percent
      FROM public.products p
      LEFT JOIN recipe_stats rs ON rs.product_id = p.id
      LEFT JOIN sales_stats ss ON ss.product_id = p.id
      WHERE p.is_active = true
    ) sub
  ),
  enriched_products AS (
    SELECT
      p.id,
      p.name::text,
      p.description::text,
      p.price::numeric,
      p.cost::numeric,
      CASE
        WHEN p.track_stock = true AND rs.recipe_cost > 0 THEN rs.recipe_cost
        ELSE COALESCE(p.cost, 0)
      END::numeric AS effective_cost,
      (
        p.price - CASE
          WHEN p.track_stock = true AND rs.recipe_cost > 0 THEN rs.recipe_cost
          ELSE COALESCE(p.cost, 0)
        END
      )::numeric AS margin_amount,
      CASE
        WHEN p.price > 0 THEN
          ROUND((
            (p.price - CASE
              WHEN p.track_stock = true AND rs.recipe_cost > 0 THEN rs.recipe_cost
              ELSE COALESCE(p.cost, 0)
            END) / p.price
          ) * 100, 2)
        ELSE 0
      END::numeric AS margin_percent,
      p.image_url::text,
      p.category_id,
      c.name::text AS category_name,
      p.is_active,
      p.track_stock,
      p.created_at,
      COALESCE(ss.total_sold, 0)::bigint AS total_sold,
      COALESCE(ss.total_revenue, 0)::numeric AS total_revenue,
      rev.avg_rating::numeric AS avg_rating,
      COALESCE(rev.reviews_count, 0)::bigint AS reviews_count,
      COALESCE(fav.favorites_count, 0)::bigint AS favorites_count,
      CASE
        WHEN p.track_stock = false THEN 'untracked'
        WHEN rs.is_out_of_stock = true THEN 'out_of_stock'
        WHEN rs.is_low_stock = true THEN 'low_stock'
        ELSE 'in_stock'
      END::text AS stock_status,
      rs.min_preparable::integer AS max_preparable,
      CASE
        WHEN COALESCE(ss.total_sold, 0) >= cb.avg_sold AND 
             (CASE WHEN p.price > 0 THEN ((p.price - CASE WHEN p.track_stock = true AND rs.recipe_cost > 0 THEN rs.recipe_cost ELSE COALESCE(p.cost, 0) END) / p.price) * 100 ELSE 0 END) >= cb.avg_margin 
          THEN 'star'
        WHEN COALESCE(ss.total_sold, 0) >= cb.avg_sold AND 
             (CASE WHEN p.price > 0 THEN ((p.price - CASE WHEN p.track_stock = true AND rs.recipe_cost > 0 THEN rs.recipe_cost ELSE COALESCE(p.cost, 0) END) / p.price) * 100 ELSE 0 END) < cb.avg_margin 
          THEN 'workhorse'
        WHEN COALESCE(ss.total_sold, 0) < cb.avg_sold AND 
             (CASE WHEN p.price > 0 THEN ((p.price - CASE WHEN p.track_stock = true AND rs.recipe_cost > 0 THEN rs.recipe_cost ELSE COALESCE(p.cost, 0) END) / p.price) * 100 ELSE 0 END) >= cb.avg_margin 
          THEN 'puzzle'
        ELSE 'dog'
      END::text AS menu_matrix_class,
      (1 + COALESCE(img.additional_images, 0))::bigint AS image_count,
      p.target_customer_ids,
      COALESCE(array_length(p.target_customer_ids, 1), 0)::integer AS target_customers_count,
      (p.target_customer_ids IS NOT NULL AND array_length(p.target_customer_ids, 1) > 0) AS is_exclusive
    FROM public.products p
    CROSS JOIN catalog_benchmarks cb
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN recipe_stats rs ON rs.product_id = p.id
    LEFT JOIN sales_stats ss ON ss.product_id = p.id
    LEFT JOIN review_stats rev ON rev.product_id = p.id
    LEFT JOIN fav_stats fav ON fav.product_id = p.id
    LEFT JOIN img_stats img ON img.product_id = p.id
  ),
  filtered_products AS (
    SELECT *
    FROM enriched_products ep
    WHERE
      (p_search IS NULL OR ep.name ILIKE '%' || p_search || '%' OR ep.description ILIKE '%' || p_search || '%')
      AND (p_category_id IS NULL OR ep.category_id = p_category_id)
      AND (
        p_status = 'all' OR
        (p_status = 'active' AND ep.is_active = true) OR
        (p_status = 'inactive' AND ep.is_active = false)
      )
      AND (
        p_stock_status = 'all' OR
        ep.stock_status = p_stock_status
      )
      AND (
        p_menu_matrix = 'all' OR
        ep.menu_matrix_class = p_menu_matrix
      )
      AND (
        p_audience = 'all' OR
        (p_audience = 'public' AND ep.is_exclusive = false) OR
        (p_audience = 'special' AND ep.is_exclusive = true)
      )
  ),
  counted_products AS (
    SELECT *, COUNT(*) OVER()::bigint AS total_count
    FROM filtered_products
  )
  SELECT
    counted_products.id,
    counted_products.name,
    counted_products.description,
    counted_products.price,
    counted_products.cost,
    counted_products.effective_cost,
    counted_products.margin_amount,
    counted_products.margin_percent,
    counted_products.image_url,
    counted_products.category_id,
    counted_products.category_name,
    counted_products.is_active,
    counted_products.track_stock,
    counted_products.created_at,
    counted_products.total_sold,
    counted_products.total_revenue,
    counted_products.avg_rating,
    counted_products.reviews_count,
    counted_products.favorites_count,
    counted_products.stock_status,
    counted_products.max_preparable,
    counted_products.menu_matrix_class,
    counted_products.image_count,
    counted_products.target_customer_ids,
    counted_products.target_customers_count,
    counted_products.is_exclusive,
    counted_products.total_count
  FROM counted_products
  ORDER BY
    CASE WHEN p_sort_by = 'sales_desc' THEN total_sold END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'revenue_desc' THEN total_revenue END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'margin_desc' THEN margin_percent END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'price_desc' THEN price END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'price_asc' THEN price END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'stock_asc' THEN max_preparable END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'name_asc' THEN name END ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_products_directory(text, uuid, text, text, text, text, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_products_directory(text, uuid, text, text, text, text, int, int, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. get_admin_products_kpis
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_products_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  WITH recipe_stats AS (
    SELECT
      rec.product_id,
      COUNT(rec.id) AS ingredients_count,
      COALESCE(SUM(rec.quantity_used * COALESCE(ing.average_cost, 0)), 0)::numeric AS recipe_cost,
      BOOL_OR(
        rec.deduct_stock_automatically = true 
        AND ing.track_inventory = true 
        AND (ing.current_stock < rec.quantity_used OR ing.current_stock <= 0)
      ) AS is_out_of_stock,
      BOOL_OR(
        rec.deduct_stock_automatically = true 
        AND ing.track_inventory = true 
        AND ing.current_stock > 0 
        AND ing.current_stock <= COALESCE(ing.low_stock_threshold, 5)
      ) AS is_low_stock
    FROM public.product_recipes rec
    JOIN public.ingredients ing ON ing.id = rec.ingredient_id
    GROUP BY rec.product_id
  ),
  sales_stats AS (
    SELECT
      oi.product_id,
      COALESCE(SUM(oi.quantity), 0)::bigint AS total_sold,
      COALESCE(SUM(oi.quantity * oi.price), 0)::numeric AS total_revenue
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'completado'
    GROUP BY oi.product_id
  ),
  base AS (
    SELECT
      p.id,
      p.name,
      p.price,
      p.is_active,
      p.track_stock,
      p.category_id,
      ROUND(
        CASE 
          WHEN p.track_stock = true AND COALESCE(rs.ingredients_count, 0) > 0 
          THEN rs.recipe_cost 
          ELSE COALESCE(p.cost, 0) 
        END, 
        2
      )::numeric AS effective_cost,
      COALESCE(ss.total_sold, 0)::bigint AS total_sold,
      COALESCE(ss.total_revenue, 0)::numeric AS total_revenue,
      CASE
        WHEN NOT p.track_stock THEN 'untracked'
        WHEN COALESCE(rs.is_out_of_stock, false) = true THEN 'out_of_stock'
        WHEN COALESCE(rs.is_low_stock, false) = true THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status
    FROM public.products p
    LEFT JOIN recipe_stats rs ON rs.product_id = p.id
    LEFT JOIN sales_stats ss ON ss.product_id = p.id
  ),
  with_margin AS (
    SELECT
      *,
      CASE 
        WHEN price > 0 THEN ROUND(((price - effective_cost) / price) * 100, 2)::numeric 
        ELSE 0::numeric 
      END AS margin_percent,
      AVG(total_sold) OVER() AS avg_sales,
      AVG(
        CASE 
          WHEN price > 0 THEN ((price - effective_cost) / price) * 100 
          ELSE 0 
        END
      ) OVER() AS avg_margin
    FROM base
  ),
  with_matrix AS (
    SELECT
      *,
      CASE
        WHEN total_sold >= avg_sales AND margin_percent >= avg_margin THEN 'star'
        WHEN total_sold >= avg_sales AND margin_percent < avg_margin THEN 'workhorse'
        WHEN total_sold < avg_sales AND margin_percent >= avg_margin THEN 'puzzle'
        ELSE 'dog'
      END AS menu_matrix_class
    FROM with_margin
  ),
  top_selling AS (
    SELECT jsonb_build_object(
      'id', id,
      'name', name,
      'total_sold', total_sold,
      'total_revenue', total_revenue
    ) AS top_item
    FROM with_matrix
    ORDER BY total_sold DESC, total_revenue DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'total_products', COUNT(*),
    'active_products', COUNT(*) FILTER (WHERE is_active = true),
    'inactive_products', COUNT(*) FILTER (WHERE is_active = false),
    'total_categories', COUNT(DISTINCT category_id),
    'total_catalog_revenue', COALESCE(SUM(total_revenue), 0),
    'total_units_sold', COALESCE(SUM(total_sold), 0),
    'avg_profit_margin', COALESCE(ROUND(AVG(margin_percent) FILTER (WHERE is_active = true), 1), 0),
    'out_of_stock_count', COUNT(*) FILTER (WHERE is_active = true AND stock_status = 'out_of_stock'),
    'low_stock_count', COUNT(*) FILTER (WHERE is_active = true AND stock_status = 'low_stock'),
    'untracked_stock_count', COUNT(*) FILTER (WHERE track_stock = false),
    'star_count', COUNT(*) FILTER (WHERE menu_matrix_class = 'star'),
    'workhorse_count', COUNT(*) FILTER (WHERE menu_matrix_class = 'workhorse'),
    'puzzle_count', COUNT(*) FILTER (WHERE menu_matrix_class = 'puzzle'),
    'dog_count', COUNT(*) FILTER (WHERE menu_matrix_class = 'dog'),
    'top_seller', COALESCE((SELECT top_item FROM top_selling), '{}'::jsonb)
  ) INTO v_result
  FROM with_matrix;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_products_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_products_kpis() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. get_detailed_referral_info
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_detailed_referral_info()
RETURNS TABLE(
  customer_id uuid,
  customer_name character varying,
  referral_code character varying,
  referral_count integer,
  level_name character varying,
  referred_customers jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  RETURN QUERY
  SELECT
    c.id as customer_id,
    c.name as customer_name,
    c.referral_code,
    c.referral_count,
    (SELECT l.name FROM public.referral_levels l WHERE c.referral_count >= l.min_referrals ORDER BY l.min_referrals DESC LIMIT 1) as level_name,
    (SELECT jsonb_agg(jsonb_build_object('name', rc.name, 'phone', rc.phone, 'registered_at', rc.created_at))
     FROM public.customers rc WHERE rc.referrer_id = c.id) as referred_customers
  FROM
    public.customers c
  ORDER BY
    c.referral_count DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_detailed_referral_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_detailed_referral_info() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. get_customers_with_referrals
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customers_with_referrals()
RETURNS TABLE(
  id uuid,
  customer_name character varying,
  phone character varying,
  referral_code character varying,
  referral_count integer,
  level_name character varying,
  referred_customers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  RETURN QUERY
  WITH customer_referrals AS (
    SELECT 
      c.id,
      c.name AS customer_name,
      c.phone,
      c.referral_code,
      c.referral_count,
      c.referrer_id,
      COALESCE(
        json_agg(
          json_build_object('name', r.name, 'phone', r.phone)
          ORDER BY r.created_at DESC
        ) FILTER (WHERE r.id IS NOT NULL),
        '[]'::json
      ) AS referred_customers
    FROM customers c
    LEFT JOIN customers r ON r.referrer_id = c.id
    WHERE c.referral_code IS NOT NULL
    GROUP BY c.id, c.name, c.phone, c.referral_code, c.referral_count, c.referrer_id
  ),
  customer_levels AS (
    SELECT 
      cr.*,
      COALESCE(
        (
          SELECT rl.name 
          FROM referral_levels rl 
          WHERE cr.referral_count >= rl.min_referrals 
          ORDER BY rl.min_referrals DESC 
          LIMIT 1
        ),
        'Novato'
      ) AS level_name
    FROM customer_referrals cr
  )
  SELECT 
    cl.id,
    cl.customer_name,
    cl.phone,
    cl.referral_code,
    cl.referral_count,
    cl.level_name,
    cl.referred_customers::jsonb
  FROM customer_levels cl
  ORDER BY cl.referral_count DESC, cl.customer_name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_customers_with_referrals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customers_with_referrals() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. get_admin_product_detail_analytics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_product_detail_analytics(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_json jsonb;
  v_recipe_json jsonb;
  v_top_customers_json jsonb;
  v_recent_orders_json jsonb;
  v_sales_30d_json jsonb;
  v_reviews_json jsonb;
  v_assigned_customers_json jsonb;
  v_target_ids uuid[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  -- 1. Datos base y financieros del producto
  SELECT 
    p.target_customer_ids,
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'price', p.price,
      'cost', p.cost,
      'image_url', p.image_url,
      'category_id', p.category_id,
      'category_name', COALESCE(c.name, 'Sin categoría'),
      'is_active', p.is_active,
      'track_stock', p.track_stock,
      'created_at', p.created_at,
      'target_customer_ids', p.target_customer_ids,
      'is_exclusive', (p.target_customer_ids IS NOT NULL AND array_length(p.target_customer_ids, 1) > 0)
    ) INTO v_target_ids, v_product_json
  FROM public.products p
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE p.id = p_product_id;

  IF v_product_json IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Desglose de insumos de la receta con stock en almacén y capacidad de porciones
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id', ing.id,
        'ingredient_name', ing.name,
        'base_unit', ing.base_unit,
        'average_cost', ing.average_cost,
        'current_stock', ing.current_stock,
        'low_stock_threshold', ing.low_stock_threshold,
        'quantity_used', rec.quantity_used,
        'ingredient_cost_in_dish', ROUND(rec.quantity_used * COALESCE(ing.average_cost, 0), 2),
        'deduct_stock_automatically', rec.deduct_stock_automatically,
        'preparable_units', CASE 
          WHEN rec.quantity_used > 0 AND ing.track_inventory = true 
          THEN FLOOR(ing.current_stock / rec.quantity_used)::integer 
          ELSE NULL 
        END,
        'is_out_of_stock', (ing.track_inventory = true AND (ing.current_stock < rec.quantity_used OR ing.current_stock <= 0)),
        'is_low_stock', (ing.track_inventory = true AND ing.current_stock > 0 AND ing.current_stock <= COALESCE(ing.low_stock_threshold, 5))
      )
      ORDER BY ing.name ASC
    ),
    '[]'::jsonb
  ) INTO v_recipe_json
  FROM public.product_recipes rec
  JOIN public.ingredients ing ON ing.id = rec.ingredient_id
  WHERE rec.product_id = p_product_id;

  -- 3. Top 5 Clientes que más compran este producto
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'customer_id', c.id,
        'customer_name', c.name,
        'customer_phone', c.phone,
        'total_qty', sq.total_qty,
        'total_spent', sq.total_spent,
        'last_ordered_at', sq.last_ordered_at
      )
      ORDER BY sq.total_spent DESC
    ),
    '[]'::jsonb
  ) INTO v_top_customers_json
  FROM (
    SELECT
      o.customer_id,
      SUM(oi.quantity)::integer AS total_qty,
      SUM(oi.quantity * oi.price)::numeric AS total_spent,
      MAX(o.created_at) AS last_ordered_at
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id AND o.status = 'completado' AND o.customer_id IS NOT NULL
    GROUP BY o.customer_id
    ORDER BY total_spent DESC
    LIMIT 5
  ) sq
  JOIN public.customers c ON c.id = sq.customer_id;

  -- 4. Pedidos Recientes (Últimos 8 pedidos donde se solicitó este producto)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'order_id', o.id,
        'order_code', o.code,
        'customer_name', COALESCE(c.name, 'Cliente Mostrador'),
        'customer_phone', c.phone,
        'created_at', o.created_at,
        'status', o.status,
        'quantity', oi.quantity,
        'unit_price', oi.price,
        'total_item_amount', ROUND(oi.quantity * oi.price, 2)
      )
      ORDER BY o.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_recent_orders_json
  FROM (
    SELECT oi.order_id, oi.quantity, oi.price
    FROM public.order_items oi
    WHERE oi.product_id = p_product_id
    ORDER BY oi.id DESC
    LIMIT 8
  ) oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.customers c ON c.id = o.customer_id;

  -- 5. Resumen de Ventas de los últimos 30 días
  SELECT jsonb_build_object(
    'units_sold_30d', COALESCE(SUM(oi.quantity), 0)::integer,
    'revenue_30d', COALESCE(SUM(oi.quantity * oi.price), 0)::numeric,
    'orders_count_30d', COUNT(DISTINCT o.id)::integer
  ) INTO v_sales_30d_json
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.status = 'completado'
    AND o.created_at >= (NOW() - INTERVAL '30 days');

  -- 6. Reseñas y Calificaciones recientes
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', pr.id,
        'rating', pr.rating,
        'comment', pr.comment,
        'created_at', pr.created_at,
        'customer_name', COALESCE(c.name, 'Cliente anónimo')
      )
      ORDER BY pr.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_reviews_json
  FROM public.product_reviews pr
  LEFT JOIN public.customers c ON c.id = pr.customer_id
  WHERE pr.product_id = p_product_id
  LIMIT 10;

  -- 7. Clientes Asignados para Audiencia Especial
  IF v_target_ids IS NOT NULL AND array_length(v_target_ids, 1) > 0 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'customer_id', c.id,
          'customer_name', c.name,
          'customer_phone', c.phone
        )
        ORDER BY c.name ASC
      ),
      '[]'::jsonb
    ) INTO v_assigned_customers_json
    FROM public.customers c
    WHERE c.id = ANY(v_target_ids);
  ELSE
    v_assigned_customers_json := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'product', v_product_json,
    'recipe', v_recipe_json,
    'top_customers', v_top_customers_json,
    'recent_orders', v_recent_orders_json,
    'sales_summary_30d', v_sales_30d_json,
    'reviews', v_reviews_json,
    'assigned_customers', v_assigned_customers_json
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_product_detail_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_product_detail_analytics(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. save_product_with_recipe
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_product_with_recipe(
    p_product jsonb,
    p_recipe_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_product_id uuid;
    v_id_input uuid;
    v_track_stock boolean;
    v_target_customer_ids uuid[] := NULL;
    v_item jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    -- 1. Extraer ID si fue proporcionado (creación vs edición)
    IF p_product ? 'id' AND p_product->>'id' IS NOT NULL AND p_product->>'id' <> '' THEN
        v_id_input := (p_product->>'id')::uuid;
    ELSE
        v_id_input := gen_random_uuid();
    END IF;

    v_track_stock := COALESCE((p_product->>'track_stock')::boolean, false);

    -- 2. Procesar target_customer_ids si viene en el payload
    IF p_product ? 'target_customer_ids' AND p_product->'target_customer_ids' IS NOT NULL AND jsonb_typeof(p_product->'target_customer_ids') = 'array' THEN
        SELECT COALESCE(array_agg(elem::uuid), NULL)
        INTO v_target_customer_ids
        FROM jsonb_array_elements_text(p_product->'target_customer_ids') AS elem
        WHERE elem IS NOT NULL AND elem <> '';
        IF array_length(v_target_customer_ids, 1) IS NULL THEN
            v_target_customer_ids := NULL;
        END IF;
    END IF;

    -- 3. Upsert del producto
    INSERT INTO public.products (
        id,
        name,
        description,
        price,
        cost,
        image_url,
        category_id,
        is_active,
        track_stock,
        target_customer_ids
    )
    VALUES (
        v_id_input,
        (p_product->>'name')::varchar,
        p_product->>'description',
        COALESCE((p_product->>'price')::numeric, 0),
        COALESCE((p_product->>'cost')::numeric, 0),
        p_product->>'image_url',
        (p_product->>'category_id')::uuid,
        COALESCE((p_product->>'is_active')::boolean, true),
        v_track_stock,
        v_target_customer_ids
    )
    ON CONFLICT (id) DO UPDATE
    SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        cost = EXCLUDED.cost,
        image_url = EXCLUDED.image_url,
        category_id = EXCLUDED.category_id,
        is_active = EXCLUDED.is_active,
        track_stock = EXCLUDED.track_stock,
        target_customer_ids = CASE 
            WHEN p_product ? 'target_customer_ids' THEN v_target_customer_ids 
            ELSE products.target_customer_ids 
        END
    RETURNING id INTO v_product_id;

    -- 4. Borrado atómico de la receta previa
    DELETE FROM public.product_recipes
    WHERE product_id = v_product_id;

    -- 5. Si el producto rastrea stock y se enviaron ingredientes, insertarlos
    IF v_track_stock AND p_recipe_items IS NOT NULL AND jsonb_array_length(p_recipe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_recipe_items)
        LOOP
            INSERT INTO public.product_recipes (
                product_id,
                ingredient_id,
                quantity_used,
                deduct_stock_automatically
            )
            VALUES (
                v_product_id,
                (v_item->>'ingredient_id')::uuid,
                COALESCE((v_item->>'quantity_used')::numeric, 1),
                COALESCE((v_item->>'deduct_stock_automatically')::boolean, true)
            );
        END LOOP;
    END IF;

    -- 6. Retornar el ID del producto guardado
    RETURN v_product_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_product_with_recipe(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_with_recipe(jsonb, jsonb) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. update_product_audience
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_product_audience(
    p_product_id uuid,
    p_target_customer_ids uuid[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned_ids uuid[];
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    IF p_target_customer_ids IS NOT NULL AND array_length(p_target_customer_ids, 1) > 0 THEN
        SELECT array_agg(DISTINCT id)
        INTO v_cleaned_ids
        FROM unnest(p_target_customer_ids) AS id
        WHERE id IS NOT NULL;
        IF array_length(v_cleaned_ids, 1) IS NULL THEN
            v_cleaned_ids := NULL;
        END IF;
    ELSE
        v_cleaned_ids := NULL;
    END IF;

    UPDATE public.products
    SET target_customer_ids = v_cleaned_ids
    WHERE id = p_product_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_product_audience(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product_audience(uuid, uuid[]) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. delete_referral_level
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_referral_level(level_id_to_delete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    -- Primero, elimina las recompensas asociadas a ese nivel
    DELETE FROM public.rewards WHERE level_id = level_id_to_delete;
    -- Luego, elimina el nivel
    DELETE FROM public.referral_levels WHERE id = level_id_to_delete;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_referral_level(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_referral_level(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. abrir_caja_segura
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abrir_caja_segura(
    p_id TEXT,
    p_monto_inicial NUMERIC,
    p_opened_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_id TEXT;
    v_existing_caja RECORD;
    v_new_caja RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    IF p_opened_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Acceso denegado: no se puede abrir caja en nombre de otro usuario.';
    END IF;

    -- 1. Verificar si el usuario ya tiene un turno abierto
    SELECT * INTO v_existing_caja
    FROM public.cash_registers
    WHERE opened_by = p_opened_by AND estado = 'abierta'
    LIMIT 1;

    IF v_existing_caja.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_OPEN',
            'message', 'Ya existe un turno de caja abierto para este usuario en otro dispositivo.',
            'caja', row_to_json(v_existing_caja)
        );
    END IF;

    -- 2. Insertar nueva sesión de caja
    INSERT INTO public.cash_registers (
        id,
        opened_by,
        monto_inicial,
        estado,
        fecha_apertura,
        ventas_efectivo,
        entradas_efectivo,
        salidas_efectivo
    ) VALUES (
        p_id,
        p_opened_by,
        COALESCE(p_monto_inicial, 0),
        'abierta',
        now(),
        0,
        0,
        0
    )
    RETURNING * INTO v_new_caja;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'OPENED',
        'message', 'Turno de caja abierto correctamente.',
        'caja', row_to_json(v_new_caja)
    );
EXCEPTION
    WHEN unique_violation THEN
        -- En caso de concurrencia extrema (dos clics simultáneos)
        SELECT * INTO v_existing_caja
        FROM public.cash_registers
        WHERE opened_by = p_opened_by AND estado = 'abierta'
        LIMIT 1;

        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_OPEN',
            'message', 'Ya existe un turno de caja abierto para este usuario.',
            'caja', row_to_json(v_existing_caja)
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.abrir_caja_segura(TEXT, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_caja_segura(TEXT, NUMERIC, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12. adjust_ingredient_stock
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock(
    p_ingredient_id uuid,
    p_adjustment_amount numeric,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    -- Actualizar el stock
    UPDATE public.ingredients
    SET current_stock = current_stock + p_adjustment_amount
    WHERE id = p_ingredient_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.adjust_ingredient_stock(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_ingredient_stock(uuid, numeric, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13. Reinforce get_advanced_dashboard_stats grants
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_advanced_dashboard_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_advanced_dashboard_stats(timestamptz, timestamptz) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 14. Fix search_path on get_my_loyalty_category
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.get_my_loyalty_category() SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 15. Revoke HTTP extensions from anon and public (SSRF prevention)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname IN ('http_get', 'http_post', 'http_put', 'http_delete', 'http_head', 'http')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.func_sig);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC, anon';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 16. Correct discounts RLS policy
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'discounts' 
      AND policyname = 'Customers can read active discounts'
  ) THEN
    ALTER POLICY "Customers can read active discounts" ON public.discounts 
      USING (
        (is_active = true) 
        AND (
          specific_customer_id IS NULL 
          OR (public.get_my_customer_id() IS NOT NULL AND specific_customer_id = public.get_my_customer_id())
          OR public.is_admin()
          OR (SELECT auth.uid()) IS NULL
        )
      );
  END IF;
END $$;
