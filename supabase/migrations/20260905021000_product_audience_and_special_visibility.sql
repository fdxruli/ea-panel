-- ============================================================================
-- Migration: 20260905021000_product_audience_and_special_visibility.sql
-- Description: Soporte de audiencia y visibilidad para productos (Público en general vs Clientes Especiales).
--              Incluye columna target_customer_ids, índice GIN, políticas RLS, RPCs de consulta de menú,
--              guardado atómico, actualización rápida de audiencia y directorio administrativo.
-- Author: Antigravity
-- ============================================================================

-- 1. COLUMNA DE AUDIENCIA E ÍNDICE GIN
-- ============================================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS target_customer_ids uuid[] DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_products_target_customer_ids
  ON public.products USING GIN (target_customer_ids);

-- 2. ACTUALIZACIÓN DE POLÍTICA RLS PARA CLIENTES PÚBLICOS
-- ============================================================================
-- Los clientes públicos anónimos o no seleccionados solo pueden leer por SELECT directo
-- productos activos cuya audiencia sea pública (target_customer_ids IS NULL o vacío).
DROP POLICY IF EXISTS "Public can read active menu products" ON public.products;

CREATE POLICY "Public can read active menu products"
ON public.products
AS PERMISSIVE
FOR SELECT
TO anon, authenticated
USING (
  is_active = true 
  AND (target_customer_ids IS NULL OR array_length(target_customer_ids, 1) IS NULL)
);

-- 3. ACTUALIZACIÓN DEL RPC get_active_menu_products PARA CATÁLOGO DE MENÚ
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_active_menu_products();
DROP FUNCTION IF EXISTS public.get_active_menu_products(uuid);

CREATE OR REPLACE FUNCTION public.get_active_menu_products(p_customer_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    name character varying,
    description text,
    price numeric,
    image_url text,
    category_id uuid,
    is_active boolean,
    track_stock boolean,
    created_at timestamp with time zone,
    is_out_of_stock boolean,
    product_images json,
    is_exclusive boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.image_url,
        p.category_id,
        p.is_active,
        p.track_stock,
        p.created_at,
        CASE 
            WHEN p.track_stock = true AND EXISTS (
                SELECT 1
                FROM public.product_recipes rec
                JOIN public.ingredients ing ON rec.ingredient_id = ing.id
                WHERE rec.product_id = p.id
                  AND rec.deduct_stock_automatically = true
                  AND ing.track_inventory = true
                  AND (ing.current_stock < rec.quantity_used OR ing.current_stock <= 0)
            ) THEN true
            ELSE false
        END AS is_out_of_stock,
        COALESCE(
            (
                SELECT json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url))
                FROM public.product_images pi
                WHERE pi.product_id = p.id
            ),
            '[]'::json
        ) AS product_images,
        (p.target_customer_ids IS NOT NULL AND array_length(p.target_customer_ids, 1) > 0) AS is_exclusive
    FROM public.products p
    WHERE p.is_active = true
      AND (
        p.target_customer_ids IS NULL 
        OR array_length(p.target_customer_ids, 1) IS NULL
        OR (p_customer_id IS NOT NULL AND p_customer_id = ANY(p.target_customer_ids))
      )
    ORDER BY p.name ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_active_menu_products(uuid)
  TO anon, authenticated, service_role;


-- 4. RPC: ACTUALIZACIÓN RÁPIDA DE AUDIENCIA DE UN PRODUCTO
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_product_audience(
    p_product_id uuid,
    p_target_customer_ids uuid[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_cleaned_ids uuid[];
BEGIN
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
        RAISE EXCEPTION 'Producto con ID % no encontrado', p_product_id;
    END IF;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_product_audience(uuid, uuid[])
  TO authenticated, service_role;


-- 5. RPC: GUARDADO ATÓMICO CON RECETA Y AUDIENCIA (save_product_with_recipe)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_product_with_recipe(
    p_product jsonb,
    p_recipe_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_product_id uuid;
    v_id_input uuid;
    v_track_stock boolean;
    v_target_customer_ids uuid[] := NULL;
    v_item jsonb;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.save_product_with_recipe(jsonb, jsonb)
  TO authenticated, service_role;


-- 6. RPC: DIRECTORIO ADMINISTRATIVO CON AUDIENCIA Y FILTROS
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_admin_products_directory(text, uuid, text, text, text, text, int, int);
DROP FUNCTION IF EXISTS public.get_admin_products_directory(text, uuid, text, text, text, text, int, int, text);

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    SELECT *, COUNT(*) OVER() AS total_count
    FROM filtered_products
  )
  SELECT
    id, name, description, price, cost, effective_cost, margin_amount, margin_percent,
    image_url, category_id, category_name, is_active, track_stock, created_at,
    total_sold, total_revenue, avg_rating, reviews_count, favorites_count,
    stock_status, max_preparable, menu_matrix_class, image_count,
    target_customer_ids, target_customers_count, is_exclusive,
    total_count
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
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_products_directory(text, uuid, text, text, text, text, int, int, text)
  TO anon, authenticated, service_role;


-- 7. RPC: DETALLE 360° CON DESGLOSE DE CLIENTES ASIGNADOS
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
  v_assigned_customers_json jsonb;
  v_target_ids uuid[];
BEGIN
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

GRANT EXECUTE ON FUNCTION public.get_admin_product_detail_analytics(uuid)
  TO anon, authenticated, service_role;
