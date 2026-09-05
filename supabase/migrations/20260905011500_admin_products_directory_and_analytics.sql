-- ============================================================================
-- Migration: 20260905011500_admin_products_directory_and_analytics.sql
-- Description: RPCs de alto rendimiento para el directorio administrativo de productos,
--              cálculo de costos por receta, márgenes, disponibilidad de inventario,
--              clasificación de ingeniería de menú (Matriz BCG), KPIs globales y detalle 360.
-- Author: Antigravity
-- ============================================================================

-- 1. ÍNDICES DE OPTIMIZACIÓN COMPLEMENTARIOS
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_product_recipes_product_id
  ON public.product_recipes (product_id);

CREATE INDEX IF NOT EXISTS idx_product_recipes_ingredient_id
  ON public.product_recipes (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_ingredients_stock_alert
  ON public.ingredients (track_inventory, current_stock, low_stock_threshold);


-- 2. RPC: Directorio Administrativo de Productos con Filtros, Orden y Analítica
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_products_directory(
  p_search text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_stock_status text DEFAULT 'all',
  p_menu_matrix text DEFAULT 'all',
  p_sort_by text DEFAULT 'sales_desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
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
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH recipe_stats AS (
    SELECT
      rec.product_id,
      COUNT(rec.id) AS ingredients_count,
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
      ROUND(AVG(pr.rating), 1)::numeric AS avg_rating,
      COUNT(pr.id)::bigint AS reviews_count
    FROM public.product_reviews pr
    GROUP BY pr.product_id
  ),
  favorite_stats AS (
    SELECT
      cf.product_id,
      COUNT(cf.customer_id)::bigint AS favorites_count
    FROM public.customer_favorites cf
    GROUP BY cf.product_id
  ),
  image_stats AS (
    SELECT
      pi.product_id,
      COUNT(pi.id)::bigint AS additional_images_count
    FROM public.product_images pi
    GROUP BY pi.product_id
  ),
  raw_enriched AS (
    SELECT
      p.id,
      p.name::text AS name,
      p.description::text AS description,
      p.price::numeric AS price,
      p.cost::numeric AS cost,
      ROUND(
        CASE 
          WHEN p.track_stock = true AND COALESCE(rs.ingredients_count, 0) > 0 
          THEN rs.recipe_cost 
          ELSE COALESCE(p.cost, 0) 
        END, 
        2
      )::numeric AS effective_cost,
      p.image_url::text AS image_url,
      p.category_id,
      COALESCE(c.name, 'Sin categoría')::text AS category_name,
      p.is_active,
      p.track_stock,
      p.created_at,
      COALESCE(ss.total_sold, 0)::bigint AS total_sold,
      COALESCE(ss.total_revenue, 0)::numeric AS total_revenue,
      rev.avg_rating,
      COALESCE(rev.reviews_count, 0)::bigint AS reviews_count,
      COALESCE(fav.favorites_count, 0)::bigint AS favorites_count,
      COALESCE(img.additional_images_count, 0) + (CASE WHEN p.image_url IS NOT NULL AND p.image_url <> '' THEN 1 ELSE 0 END)::bigint AS image_count,
      CASE
        WHEN NOT p.track_stock THEN 'untracked'
        WHEN COALESCE(rs.is_out_of_stock, false) = true THEN 'out_of_stock'
        WHEN COALESCE(rs.is_low_stock, false) = true THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status,
      CASE
        WHEN p.track_stock = true AND COALESCE(rs.ingredients_count, 0) > 0 
        THEN GREATEST(0, COALESCE(rs.min_preparable, 0))::integer
        ELSE NULL
      END AS max_preparable
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN recipe_stats rs ON rs.product_id = p.id
    LEFT JOIN sales_stats ss ON ss.product_id = p.id
    LEFT JOIN review_stats rev ON rev.product_id = p.id
    LEFT JOIN favorite_stats fav ON fav.product_id = p.id
    LEFT JOIN image_stats img ON img.product_id = p.id
  ),
  margins_calculated AS (
    SELECT
      *,
      ROUND(price - effective_cost, 2)::numeric AS margin_amount,
      CASE 
        WHEN price > 0 THEN ROUND(((price - effective_cost) / price) * 100, 2)::numeric
        ELSE 0::numeric
      END AS margin_percent,
      AVG(total_sold) OVER() AS catalog_avg_sales,
      AVG(
        CASE 
          WHEN price > 0 THEN ((price - effective_cost) / price) * 100 
          ELSE 0 
        END
      ) OVER() AS catalog_avg_margin
    FROM raw_enriched
  ),
  matrix_classified AS (
    SELECT
      id,
      name,
      description,
      price,
      cost,
      effective_cost,
      margin_amount,
      margin_percent,
      image_url,
      category_id,
      category_name,
      is_active,
      track_stock,
      created_at,
      total_sold,
      total_revenue,
      avg_rating,
      reviews_count,
      favorites_count,
      stock_status,
      max_preparable,
      CASE
        WHEN total_sold >= catalog_avg_sales AND margin_percent >= catalog_avg_margin THEN 'star'
        WHEN total_sold >= catalog_avg_sales AND margin_percent < catalog_avg_margin THEN 'workhorse'
        WHEN total_sold < catalog_avg_sales AND margin_percent >= catalog_avg_margin THEN 'puzzle'
        ELSE 'dog'
      END AS menu_matrix_class,
      image_count
    FROM margins_calculated
  ),
  filtered AS (
    SELECT *
    FROM matrix_classified
    WHERE (
      p_search IS NULL OR p_search = '' 
      OR name ILIKE '%' || p_search || '%' 
      OR description ILIKE '%' || p_search || '%'
      OR category_name ILIKE '%' || p_search || '%'
    )
    AND (
      p_category_id IS NULL OR category_id = p_category_id
    )
    AND (
      p_status IS NULL OR p_status = 'all' OR p_status = ''
      OR (p_status = 'active' AND is_active = true)
      OR (p_status = 'inactive' AND is_active = false)
    )
    AND (
      p_stock_status IS NULL OR p_stock_status = 'all' OR p_stock_status = ''
      OR stock_status = p_stock_status
    )
    AND (
      p_menu_matrix IS NULL OR p_menu_matrix = 'all' OR p_menu_matrix = ''
      OR menu_matrix_class = p_menu_matrix
    )
  ),
  counted AS (
    SELECT *, COUNT(*) OVER()::bigint AS total_count
    FROM filtered
  )
  SELECT 
    id,
    name,
    description,
    price,
    cost,
    effective_cost,
    margin_amount,
    margin_percent,
    image_url,
    category_id,
    category_name,
    is_active,
    track_stock,
    created_at,
    total_sold,
    total_revenue,
    avg_rating,
    reviews_count,
    favorites_count,
    stock_status,
    max_preparable,
    menu_matrix_class,
    image_count,
    total_count
  FROM counted
  ORDER BY 
    CASE WHEN p_sort_by = 'sales_desc' THEN total_sold END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'sales_asc' THEN total_sold END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'revenue_desc' THEN total_revenue END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'margin_desc' THEN margin_percent END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'margin_asc' THEN margin_percent END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'price_desc' THEN price END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'price_asc' THEN price END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'stock_asc' THEN COALESCE(max_preparable, 999999) END ASC,
    CASE WHEN p_sort_by = 'name_asc' THEN LOWER(name) END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'created_desc' THEN created_at END DESC NULLS LAST,
    total_sold DESC, total_revenue DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_products_directory(text, uuid, text, text, text, text, int, int)
  TO anon, authenticated, service_role;


-- 3. RPC: Indicadores Globales Reales (KPIs) del Menú y Catálogo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_products_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  )
  FROM with_matrix;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_products_kpis()
  TO anon, authenticated, service_role;


-- 4. RPC: Analítica 360° y Detalle de un Producto
-- ============================================================================
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
BEGIN
  -- 1. Datos base y financieros del producto
  SELECT jsonb_build_object(
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
    'created_at', p.created_at
  ) INTO v_product_json
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
    ),
    '[]'::jsonb
  ) INTO v_top_customers_json
  FROM (
    SELECT 
      o.customer_id,
      SUM(oi.quantity)::bigint AS total_qty,
      SUM(oi.quantity * oi.price)::numeric AS total_spent,
      MAX(o.created_at) AS last_ordered_at
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND o.status = 'completado'
    GROUP BY o.customer_id
    ORDER BY total_qty DESC, total_spent DESC
    LIMIT 5
  ) sq
  JOIN public.customers c ON c.id = sq.customer_id;

  -- 4. Últimos 10 pedidos completados que incluyen este producto
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'order_id', ro.order_id,
        'order_code', ro.order_code,
        'customer_id', ro.customer_id,
        'customer_name', ro.customer_name,
        'quantity', ro.quantity,
        'unit_price', ro.price,
        'total_item_amount', ro.quantity * ro.price,
        'created_at', ro.created_at
      )
      ORDER BY ro.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_recent_orders_json
  FROM (
    SELECT 
      oi.order_id, 
      o.order_code, 
      o.customer_id, 
      COALESCE(c.name, 'Cliente')::text AS customer_name, 
      oi.quantity, 
      oi.price, 
      o.created_at
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    LEFT JOIN public.customers c ON c.id = o.customer_id
    WHERE oi.product_id = p_product_id
      AND o.status = 'completado'
    ORDER BY o.created_at DESC
    LIMIT 10
  ) ro;

  -- 5. Resumen de ventas en los últimos 30 días
  SELECT jsonb_build_object(
    'units_sold_30d', COALESCE(SUM(oi.quantity), 0),
    'revenue_30d', COALESCE(SUM(oi.quantity * oi.price), 0),
    'orders_count_30d', COUNT(DISTINCT o.id)
  ) INTO v_sales_30d_json
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.status = 'completado'
    AND o.created_at >= NOW() - INTERVAL '30 days';

  -- 6. Reseñas y calificaciones del producto
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', pr.id,
        'rating', pr.rating,
        'comment', pr.comment,
        'created_at', pr.created_at,
        'customer_name', COALESCE(c.name, 'Cliente')
      )
      ORDER BY pr.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_reviews_json
  FROM public.product_reviews pr
  LEFT JOIN public.customers c ON c.id = pr.customer_id
  WHERE pr.product_id = p_product_id;

  RETURN jsonb_build_object(
    'product', v_product_json,
    'recipe', v_recipe_json,
    'top_customers', v_top_customers_json,
    'recent_orders', v_recent_orders_json,
    'sales_summary_30d', v_sales_30d_json,
    'reviews', v_reviews_json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_product_detail_analytics(uuid)
  TO anon, authenticated, service_role;
