-- ============================================================================
-- Migración: Corrección de referencias ambiguas de columnas en RPCs de administración
-- Fecha: 2026-09-16
-- 
-- Problema:
--   Al convertir get_admin_customers_directory y get_admin_products_directory
--   a LANGUAGE plpgsql en la migración de hardening de administración, los nombres
--   de las columnas declaradas en RETURNS TABLE se convirtieron en variables/OUT params
--   de PL/pgSQL. Al consultar las CTEs o en las cláusulas ORDER BY sin prefijo de tabla
--   (ej. 'completed_orders', 'total_sold'), PostgreSQL reportaba el error 42702:
--   "column reference 'completed_orders' is ambiguous".
--
-- Solución:
--   1. Añadir directiva #variable_conflict use_column en el bloque PL/pgSQL.
--   2. Calificar explícitamente todas las referencias a columnas con el alias
--      de la tabla/CTE correspondiente (cs., e., counted., ep., counted_products.).
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
#variable_conflict use_column
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
      cs.id,
      cs.name,
      cs.phone,
      cs.referral_code,
      cs.created_at,
      cs.total_orders,
      cs.completed_orders,
      cs.total_spent,
      cs.last_order_date,
      CASE 
        WHEN cs.completed_orders > 0 THEN ROUND(cs.total_spent / cs.completed_orders, 2)
        ELSE 0 
      END AS avg_ticket,
      CASE 
        WHEN cs.total_spent >= 3000 OR cs.completed_orders >= 15 THEN 'VIP'
        WHEN cs.completed_orders >= 4 AND cs.last_order_date >= NOW() - INTERVAL '45 days' THEN 'Frecuente'
        WHEN cs.completed_orders >= 2 AND cs.last_order_date < NOW() - INTERVAL '45 days' THEN 'En Riesgo'
        WHEN cs.completed_orders <= 1 AND cs.created_at >= NOW() - INTERVAL '30 days' THEN 'Nuevo'
        ELSE 'Inactivo'
      END AS customer_segment
    FROM cust_stats cs
  ),
  filtered AS (
    SELECT 
      e.id,
      e.name,
      e.phone,
      e.referral_code,
      e.created_at,
      e.total_orders,
      e.completed_orders,
      e.total_spent,
      e.last_order_date,
      e.avg_ticket,
      e.customer_segment
    FROM enriched e
    WHERE (
      p_search IS NULL OR p_search = '' 
      OR e.name ILIKE '%' || p_search || '%' 
      OR e.phone ILIKE '%' || p_search || '%'
    )
    AND (
      p_segment IS NULL OR p_segment = 'all' OR p_segment = ''
      OR REPLACE(LOWER(e.customer_segment), ' ', '_') = REPLACE(LOWER(p_segment), ' ', '_')
    )
  ),
  counted AS (
    SELECT 
      f.id,
      f.name,
      f.phone,
      f.referral_code,
      f.created_at,
      f.total_orders,
      f.completed_orders,
      f.total_spent,
      f.last_order_date,
      f.avg_ticket,
      f.customer_segment,
      COUNT(*) OVER()::bigint AS total_count
    FROM filtered f
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
    CASE WHEN p_sort_by = 'spent_desc' THEN counted.total_spent END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'spent_asc' THEN counted.total_spent END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'orders_desc' THEN counted.completed_orders END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'orders_asc' THEN counted.completed_orders END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'last_order_desc' THEN counted.last_order_date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'last_order_asc' THEN counted.last_order_date END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'created_desc' THEN counted.created_at END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'created_asc' THEN counted.created_at END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'name_asc' THEN LOWER(counted.name) END ASC NULLS LAST,
    counted.total_spent DESC, counted.completed_orders DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_customers_directory(text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_customers_directory(text, text, text, int, int) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. get_admin_products_directory
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
#variable_conflict use_column
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
    SELECT ep.*
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
    SELECT fp.*, COUNT(*) OVER()::bigint AS total_count
    FROM filtered_products fp
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
    CASE WHEN p_sort_by = 'sales_desc' THEN counted_products.total_sold END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'revenue_desc' THEN counted_products.total_revenue END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'margin_desc' THEN counted_products.margin_percent END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'price_desc' THEN counted_products.price END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'price_asc' THEN counted_products.price END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'stock_asc' THEN counted_products.max_preparable END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'name_asc' THEN counted_products.name END ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_products_directory(text, uuid, text, text, text, text, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_products_directory(text, uuid, text, text, text, text, int, int, text) TO authenticated, service_role;
