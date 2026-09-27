-- ============================================================================
-- Migration: 20260926230000_vip_products_and_modifiers_phase_1.sql
-- Description: Fase 1 de Productos Exclusivos VIP y Complementos/Modificadores.
--   1. Añade soporte para niveles de cliente (target_customer_tiers) y modificadores (modifiers) en productos.
--   2. Añade soporte para selected_modifiers e item_notes en order_items.
--   3. Crea función segura get_customer_loyalty_tier(customer_id) basada en compras reales.
--   4. Actualiza políticas RLS de productos para no filtrar productos por nivel a clientes públicos.
--   5. Actualiza RPC get_active_menu_products para verificar audiencia por cliente o por tier VIP/Frecuente.
--   6. Hardening en create_order_with_stock_check para impedir que usuarios sin permisos adquieran productos exclusivos.
--   7. Actualiza RPCs administrativas: update_product_audience, save_product_with_recipe y get_admin_products_directory.
-- Author: Antigravity
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ESQUEMA: COLUMNAS DE TIERS Y COMPLEMENTOS
-- ----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS target_customer_tiers text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_target_customer_tiers
  ON public.products USING GIN (target_customer_tiers);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS selected_modifiers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS item_notes text DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- 2. FUNCIÓN: get_customer_loyalty_tier(uuid)
-- Calcula de forma determinista y segura el nivel de lealtad en el servidor
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_loyalty_tier(p_customer_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_spent numeric := 0;
  v_completed_orders bigint := 0;
  v_last_order_date timestamptz;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN 'inicial';
  END IF;

  SELECT
    COALESCE(SUM(o.total_amount), 0),
    COUNT(o.id),
    MAX(o.created_at)
  INTO
    v_total_spent,
    v_completed_orders,
    v_last_order_date
  FROM public.orders o
  WHERE o.customer_id = p_customer_id
    AND o.status = 'completado'::public.order_status;

  IF (v_total_spent >= 3000 OR v_completed_orders >= 15)
     AND v_last_order_date >= NOW() - INTERVAL '90 days' THEN
    RETURN 'vip';
  ELSIF (v_total_spent >= 750 OR v_completed_orders >= 3)
     AND v_last_order_date >= NOW() - INTERVAL '90 days' THEN
    RETURN 'frecuente';
  ELSE
    RETURN 'inicial';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_loyalty_tier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_tier(uuid) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. RLS: ACTUALIZAR POLÍTICA PÚBLICA PARA PRODUCTOS ACTIVOS
-- Solo permite leer directamente productos sin audiencia restringida
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read active menu products" ON public.products;

CREATE POLICY "Public can read active menu products"
ON public.products
AS PERMISSIVE
FOR SELECT
TO anon, authenticated
USING (
  is_active = true 
  AND (target_customer_ids IS NULL OR array_length(target_customer_ids, 1) IS NULL)
  AND (target_customer_tiers IS NULL OR array_length(target_customer_tiers, 1) IS NULL)
);

-- ----------------------------------------------------------------------------
-- 4. RPC: get_active_menu_products
-- Consulta del catálogo público que resuelve automáticamente si el cliente es VIP
-- ----------------------------------------------------------------------------
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
    is_exclusive boolean,
    is_vip_exclusive boolean,
    target_customer_tiers text[],
    modifiers jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_customer_tier text := 'inicial';
BEGIN
    IF p_customer_id IS NOT NULL THEN
        v_customer_tier := public.get_customer_loyalty_tier(p_customer_id);
    END IF;

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
        (
          (p.target_customer_ids IS NOT NULL AND array_length(p.target_customer_ids, 1) > 0)
          OR
          (p.target_customer_tiers IS NOT NULL AND array_length(p.target_customer_tiers, 1) > 0)
        ) AS is_exclusive,
        (
          p.target_customer_tiers IS NOT NULL AND 'vip' = ANY(p.target_customer_tiers)
        ) AS is_vip_exclusive,
        p.target_customer_tiers,
        COALESCE(p.modifiers, '[]'::jsonb) AS modifiers
    FROM public.products p
    WHERE p.is_active = true
      AND (
        -- 1. Producto general / público
        (
          (p.target_customer_ids IS NULL OR array_length(p.target_customer_ids, 1) IS NULL)
          AND
          (p.target_customer_tiers IS NULL OR array_length(p.target_customer_tiers, 1) IS NULL)
        )
        -- 2. Asignado específicamente a este cliente por ID
        OR (
          p_customer_id IS NOT NULL 
          AND p.target_customer_ids IS NOT NULL 
          AND p_customer_id = ANY(p.target_customer_ids)
        )
        -- 3. Asignado a la categoría/tier de lealtad del cliente (ej: 'vip')
        OR (
          p_customer_id IS NOT NULL 
          AND p.target_customer_tiers IS NOT NULL 
          AND v_customer_tier = ANY(p.target_customer_tiers)
        )
      )
    ORDER BY p.name ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_active_menu_products(uuid)
  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. RPC: create_order_with_stock_check
-- Bloqueo atómico y seguro contra pedidos con productos exclusivos no autorizados
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_with_stock_check(
    p_customer_id uuid,
    p_total_amount numeric,
    p_scheduled_for timestamp with time zone,
    p_cart_items public.cart_item[],
    p_notes character varying DEFAULT NULL::character varying
)
RETURNS TABLE(order_id uuid, order_code character varying, order_status public.order_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_customer_id uuid := p_customer_id;
    v_new_order_id uuid;
    v_new_order_code character varying;
    v_order_status public.order_status;
    cart_item public.cart_item;
    req_ingredient RECORD;
    v_caller_tier text := 'inicial';
    v_restricted_prod RECORD;
BEGIN
    -- Validación de propiedad de cliente para usuarios autenticados no administradores
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_admin() THEN
        v_customer_id := public.require_my_customer_id();
        IF p_customer_id IS DISTINCT FROM v_customer_id THEN
            RAISE EXCEPTION 'Customer ownership mismatch';
        END IF;
    END IF;

    IF array_length(p_cart_items, 1) IS NULL THEN
        RAISE EXCEPTION 'El carrito está vacío';
    END IF;

    -- 0. VALIDACIÓN DE AUDIENCIA Y EXCLUSIVIDAD DE PRODUCTOS
    IF v_customer_id IS NOT NULL THEN
        v_caller_tier := public.get_customer_loyalty_tier(v_customer_id);
    END IF;

    FOR v_restricted_prod IN
        SELECT p.id, p.name, p.target_customer_ids, p.target_customer_tiers
        FROM unnest(p_cart_items) ci
        JOIN public.products p ON ci.product_id = p.id
        WHERE (p.target_customer_ids IS NOT NULL AND array_length(p.target_customer_ids, 1) > 0)
           OR (p.target_customer_tiers IS NOT NULL AND array_length(p.target_customer_tiers, 1) > 0)
    LOOP
        -- Restricción por clientes específicos
        IF v_restricted_prod.target_customer_ids IS NOT NULL 
           AND array_length(v_restricted_prod.target_customer_ids, 1) > 0
           AND (v_customer_id IS NULL OR NOT (v_customer_id = ANY(v_restricted_prod.target_customer_ids))) THEN
            RAISE EXCEPTION 'El producto "%" es exclusivo y no está disponible para tu cuenta.', v_restricted_prod.name;
        END IF;

        -- Restricción por niveles/categorías (ej: VIP)
        IF v_restricted_prod.target_customer_tiers IS NOT NULL 
           AND array_length(v_restricted_prod.target_customer_tiers, 1) > 0
           AND NOT (v_caller_tier = ANY(v_restricted_prod.target_customer_tiers)) THEN
            RAISE EXCEPTION 'El producto "%" es exclusivo para clientes con categoría %.', 
                v_restricted_prod.name, 
                array_to_string(v_restricted_prod.target_customer_tiers, ', ');
        END IF;
    END LOOP;

    -- 1. VERIFICACIÓN Y BLOQUEO DE STOCK CONSOLIDADO
    FOR req_ingredient IN
        WITH cart_expanded AS (
            SELECT 
                ci.product_id,
                ci.quantity
            FROM unnest(p_cart_items) AS ci
        ),
        needed_per_ingredient AS (
            SELECT 
                rec.ingredient_id,
                SUM(ce.quantity * rec.quantity_used) AS total_needed_for_order
            FROM cart_expanded ce
            JOIN public.products prod ON ce.product_id = prod.id
            JOIN public.product_recipes rec ON ce.product_id = rec.product_id
            JOIN public.ingredients ing ON rec.ingredient_id = ing.id
            WHERE prod.track_stock = true
              AND ing.track_inventory = true
              AND rec.deduct_stock_automatically = true
            GROUP BY rec.ingredient_id
        )
        SELECT 
            n.ingredient_id,
            n.total_needed_for_order,
            ing.name AS ingredient_name,
            ing.base_unit,
            ing.current_stock
        FROM needed_per_ingredient n
        JOIN public.ingredients ing ON n.ingredient_id = ing.id
        ORDER BY ing.id ASC
        FOR UPDATE OF ing
    LOOP
        IF req_ingredient.current_stock < req_ingredient.total_needed_for_order THEN
            RAISE EXCEPTION 'Stock insuficiente para "%". Se necesitan % % en total para cubrir tu pedido, pero solo quedan % %.', 
                req_ingredient.ingredient_name,
                req_ingredient.total_needed_for_order,
                COALESCE(req_ingredient.base_unit, 'unidades'),
                req_ingredient.current_stock,
                COALESCE(req_ingredient.base_unit, 'unidades');
        END IF;
    END LOOP;

    -- 2. INSERTAR EL PEDIDO
    INSERT INTO public.orders (customer_id, total_amount, status, scheduled_for, notes)
    VALUES (v_customer_id, p_total_amount, 'pendiente', p_scheduled_for, p_notes)
    RETURNING public.orders.id, public.orders.status INTO v_new_order_id, v_order_status;

    -- Obtener el código de orden generado por el trigger
    SELECT public.orders.order_code INTO v_new_order_code 
    FROM public.orders 
    WHERE public.orders.id = v_new_order_id;

    -- 3. INSERTAR LOS ITEMS DEL PEDIDO
    FOR cart_item IN SELECT * FROM unnest(p_cart_items)
    LOOP
        INSERT INTO public.order_items (order_id, product_id, quantity, price, cost)
        VALUES (v_new_order_id, cart_item.product_id, cart_item.quantity, cart_item.price, cart_item.cost);
    END LOOP;

    -- 4. DESCONTAR EL STOCK EN BLOQUE POR INGREDIENTE CONSOLIDADO
    UPDATE public.ingredients ing
    SET current_stock = ing.current_stock - agg.total_deduction
    FROM (
        SELECT 
            rec.ingredient_id,
            SUM(ci.quantity * rec.quantity_used) AS total_deduction
        FROM unnest(p_cart_items) ci
        JOIN public.products prod ON ci.product_id = prod.id
        JOIN public.product_recipes rec ON ci.product_id = rec.product_id
        JOIN public.ingredients i ON rec.ingredient_id = i.id
        WHERE prod.track_stock = true
          AND i.track_inventory = true
          AND rec.deduct_stock_automatically = true
        GROUP BY rec.ingredient_id
    ) agg
    WHERE ing.id = agg.ingredient_id;

    -- 5. RETORNO DE INFORMACIÓN AL CLIENTE
    RETURN QUERY 
        SELECT v_new_order_id, v_new_order_code, v_order_status;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamp with time zone, public.cart_item[], character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamp with time zone, public.cart_item[], character varying) TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 6. RPC: update_product_audience
-- Permite actualizar audiencia tanto por clientes específicos como por categorías (VIP)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_product_audience(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.update_product_audience(uuid, uuid[], text[]);

CREATE OR REPLACE FUNCTION public.update_product_audience(
    p_product_id uuid,
    p_target_customer_ids uuid[] DEFAULT NULL,
    p_target_customer_tiers text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_cleaned_ids uuid[];
    v_cleaned_tiers text[];
BEGIN
    -- 1. Limpiar customer IDs
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

    -- 2. Limpiar customer tiers (ej: 'vip', 'frecuente')
    IF p_target_customer_tiers IS NOT NULL AND array_length(p_target_customer_tiers, 1) > 0 THEN
        SELECT array_agg(DISTINCT lower(btrim(tier)))
        INTO v_cleaned_tiers
        FROM unnest(p_target_customer_tiers) AS tier
        WHERE tier IS NOT NULL AND btrim(tier) <> '';
        IF array_length(v_cleaned_tiers, 1) IS NULL THEN
            v_cleaned_tiers := NULL;
        END IF;
    ELSE
        v_cleaned_tiers := NULL;
    END IF;

    UPDATE public.products
    SET target_customer_ids = v_cleaned_ids,
        target_customer_tiers = v_cleaned_tiers
    WHERE id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto con ID % no encontrado', p_product_id;
    END IF;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_product_audience(uuid, uuid[], text[])
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. RPC: save_product_with_recipe
-- Guarda atómicamente el producto con receta, audiencia (IDs/Tiers) y modificadores
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_product_with_recipe(
    p_product jsonb,
    p_recipe_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_product_id uuid;
    v_id_input uuid;
    v_track_stock boolean;
    v_target_customer_ids uuid[] := NULL;
    v_target_customer_tiers text[] := NULL;
    v_modifiers jsonb := '[]'::jsonb;
    v_item jsonb;
BEGIN
    -- 1. Extraer ID si fue proporcionado (creación vs edición)
    IF p_product ? 'id' AND p_product->>'id' IS NOT NULL AND p_product->>'id' <> '' THEN
        v_id_input := (p_product->>'id')::uuid;
    ELSE
        v_id_input := gen_random_uuid();
    END IF;

    v_track_stock := COALESCE((p_product->>'track_stock')::boolean, false);

    -- 2. Procesar target_customer_ids
    IF p_product ? 'target_customer_ids' AND p_product->'target_customer_ids' IS NOT NULL AND jsonb_typeof(p_product->'target_customer_ids') = 'array' THEN
        SELECT COALESCE(array_agg(elem::uuid), NULL)
        INTO v_target_customer_ids
        FROM jsonb_array_elements_text(p_product->'target_customer_ids') AS elem
        WHERE elem IS NOT NULL AND elem <> '';
        IF array_length(v_target_customer_ids, 1) IS NULL THEN
            v_target_customer_ids := NULL;
        END IF;
    END IF;

    -- 3. Procesar target_customer_tiers
    IF p_product ? 'target_customer_tiers' AND p_product->'target_customer_tiers' IS NOT NULL AND jsonb_typeof(p_product->'target_customer_tiers') = 'array' THEN
        SELECT COALESCE(array_agg(lower(btrim(elem))), NULL)
        INTO v_target_customer_tiers
        FROM jsonb_array_elements_text(p_product->'target_customer_tiers') AS elem
        WHERE elem IS NOT NULL AND btrim(elem) <> '';
        IF array_length(v_target_customer_tiers, 1) IS NULL THEN
            v_target_customer_tiers := NULL;
        END IF;
    END IF;

    -- 4. Procesar modifiers
    IF p_product ? 'modifiers' AND p_product->'modifiers' IS NOT NULL AND jsonb_typeof(p_product->'modifiers') = 'array' THEN
        v_modifiers := p_product->'modifiers';
    END IF;

    -- 5. Upsert del producto
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
        target_customer_ids,
        target_customer_tiers,
        modifiers
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
        v_target_customer_ids,
        v_target_customer_tiers,
        v_modifiers
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
        END,
        target_customer_tiers = CASE 
            WHEN p_product ? 'target_customer_tiers' THEN v_target_customer_tiers 
            ELSE products.target_customer_tiers 
        END,
        modifiers = CASE 
            WHEN p_product ? 'modifiers' THEN v_modifiers 
            ELSE products.modifiers 
        END
    RETURNING id INTO v_product_id;

    -- 6. Borrado atómico de la receta previa
    DELETE FROM public.product_recipes
    WHERE product_id = v_product_id;

    -- 7. Si el producto rastrea stock y se enviaron ingredientes, insertarlos
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
                COALESCE((v_item->>'quantity_used')::numeric, 0),
                COALESCE((v_item->>'deduct_stock_automatically')::boolean, true)
            );
        END LOOP;
    END IF;

    RETURN v_product_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_product_with_recipe(jsonb, jsonb)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. RPC: get_admin_products_directory
-- Soporta filtros por audiencia: all, public, special, vip, customers
-- ----------------------------------------------------------------------------
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
  target_customer_tiers text[],
  is_exclusive boolean,
  is_vip_exclusive boolean,
  modifiers jsonb,
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
      p.target_customer_tiers,
      (
        (p.target_customer_ids IS NOT NULL AND array_length(p.target_customer_ids, 1) > 0)
        OR
        (p.target_customer_tiers IS NOT NULL AND array_length(p.target_customer_tiers, 1) > 0)
      ) AS is_exclusive,
      (
        p.target_customer_tiers IS NOT NULL AND 'vip' = ANY(p.target_customer_tiers)
      ) AS is_vip_exclusive,
      COALESCE(p.modifiers, '[]'::jsonb) AS modifiers
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
        (p_audience = 'special' AND ep.is_exclusive = true) OR
        (p_audience = 'vip' AND ep.is_vip_exclusive = true) OR
        (p_audience = 'customers' AND ep.target_customers_count > 0)
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
    counted_products.target_customer_tiers,
    counted_products.is_exclusive,
    counted_products.is_vip_exclusive,
    counted_products.modifiers,
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

GRANT EXECUTE ON FUNCTION public.get_admin_products_directory(text, uuid, text, text, text, text, int, int, text)
  TO authenticated, service_role;
