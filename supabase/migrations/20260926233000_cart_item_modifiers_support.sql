-- Migration: Support selected_modifiers and item_notes in cart_item and create_order_with_stock_check
-- Description: Extends public.cart_item composite type and updates create_order_with_stock_check
--              to persist customized add-on modifiers and item notes in public.order_items.

DO $$
BEGIN
  -- Verificar y agregar atributos a cart_item si no existen
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute 
    WHERE attrelid = 'public.cart_item'::regclass AND attname = 'selected_modifiers'
  ) THEN
    ALTER TYPE public.cart_item ADD ATTRIBUTE selected_modifiers jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute 
    WHERE attrelid = 'public.cart_item'::regclass AND attname = 'item_notes'
  ) THEN
    ALTER TYPE public.cart_item ADD ATTRIBUTE item_notes text;
  END IF;
END $$;

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

    -- 3. INSERTAR LOS ITEMS DEL PEDIDO CON MODIFICADORES Y NOTAS
    FOR cart_item IN SELECT * FROM unnest(p_cart_items)
    LOOP
        INSERT INTO public.order_items (
            order_id, 
            product_id, 
            quantity, 
            price, 
            cost, 
            selected_modifiers, 
            item_notes
        )
        VALUES (
            v_new_order_id, 
            cart_item.product_id, 
            cart_item.quantity, 
            cart_item.price, 
            cart_item.cost,
            COALESCE(cart_item.selected_modifiers, '[]'::jsonb),
            cart_item.item_notes
        );
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
