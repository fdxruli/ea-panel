-- ============================================================================
-- Migración: 20260917020000_security_boundary_hardening.sql
-- Propósito:
--   1. Eliminar políticas anónimas abiertas en public.orders y public.order_items.
--   2. Restringir public.cash_registers y public.cash_movements estrictamente a public.is_admin().
--   3. Blindar public.push_subscriptions (aislamiento por customer_id / admin).
--   4. Blindar public.customer_discount_usage (aislamiento por customer_id / admin).
--   5. Eliminar política anónima legacy residual en public.special_prices.
--   6. Endurecer create_order_with_stock_check:
--      - Validar y recalcular precios unitarios y costos desde la base de datos (public.products / special_prices).
--      - Restringir pedidos anónimos estrictamente al perfil de cliente invitado.
--   7. Crear RPC cancel_my_order(uuid) para cancelación segura por el cliente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ORDERS Y ORDER_ITEMS: Eliminar políticas anónimas abiertas
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Legacy anonymous can view orders" ON public.orders;
DROP POLICY IF EXISTS "Legacy anonymous can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Legacy anonymous can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Legacy anonymous can insert order items" ON public.order_items;

-- Asegurar que RLS esté activo
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. CAJA Y POS: Restringir estrictamente a Administradores (is_admin())
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cash_registers: authenticated can select" ON public.cash_registers;
DROP POLICY IF EXISTS "cash_registers: authenticated can insert" ON public.cash_registers;
DROP POLICY IF EXISTS "cash_registers: authenticated can update" ON public.cash_registers;
DROP POLICY IF EXISTS "cash_movements: authenticated can select" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_movements: authenticated can insert" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_registers_admin_manage" ON public.cash_registers;
DROP POLICY IF EXISTS "cash_movements_admin_manage" ON public.cash_movements;

CREATE POLICY "cash_registers_admin_manage"
  ON public.cash_registers
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "cash_movements_admin_manage"
  ON public.cash_movements
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. PUSH SUBSCRIPTIONS: Aislamiento por usuario y administradores
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can manage their push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_admin_manage" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_owner_manage" ON public.push_subscriptions;

CREATE POLICY "push_subscriptions_admin_manage"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "push_subscriptions_owner_manage"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = push_subscriptions.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = push_subscriptions.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 4. CUSTOMER DISCOUNT USAGE: Aislamiento por usuario y administradores
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can insert discount usage" ON public.customer_discount_usage;
DROP POLICY IF EXISTS "Customers can view their discount usage" ON public.customer_discount_usage;
DROP POLICY IF EXISTS "customer_discount_usage_admin_manage" ON public.customer_discount_usage;
DROP POLICY IF EXISTS "customer_discount_usage_owner_select" ON public.customer_discount_usage;
DROP POLICY IF EXISTS "customer_discount_usage_owner_insert" ON public.customer_discount_usage;

CREATE POLICY "customer_discount_usage_admin_manage"
  ON public.customer_discount_usage
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "customer_discount_usage_owner_select"
  ON public.customer_discount_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_discount_usage.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "customer_discount_usage_owner_insert"
  ON public.customer_discount_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_discount_usage.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 5. SPECIAL PRICES: Eliminar política anónima legacy residual
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Legacy anonymous can read special prices" ON public.special_prices;

-- ----------------------------------------------------------------------------
-- 6. RPC CANCEL_MY_ORDER: Cancelación segura de pedidos por el cliente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_customer_id uuid := public.require_my_customer_id();
    v_order RECORD;
BEGIN
    SELECT id, status, customer_id
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.customer_id IS DISTINCT FROM v_customer_id THEN
        RAISE EXCEPTION 'No tienes permiso para cancelar este pedido';
    END IF;

    IF v_order.status NOT IN ('pendiente', 'en_proceso') THEN
        RAISE EXCEPTION 'Este pedido no puede ser cancelado (estado actual: %)', v_order.status;
    END IF;

    UPDATE public.orders
    SET status = 'cancelado',
        cancellation_reason = 'Cancelado por el cliente.',
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_my_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_order(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. ENDURECIMIENTO DE CREATE_ORDER_WITH_STOCK_CHECK
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
    v_item_price numeric;
    v_item_cost numeric;
    c_guest_customer_id CONSTANT uuid := '68491ec0-3198-4aca-89e4-8034ebe1e35f'::uuid;
BEGIN
    -- 1. VALIDACIÓN DE IDENTIDAD Y SEGURIDAD DE CLIENTE
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_admin() THEN
        v_customer_id := public.require_my_customer_id();
        IF p_customer_id IS DISTINCT FROM v_customer_id THEN
            RAISE EXCEPTION 'Customer ownership mismatch';
        END IF;
    ELSIF (SELECT auth.uid()) IS NULL AND NOT public.is_admin() THEN
        -- Si es un visitante anónimo, debe ordenar bajo el perfil de invitado
        IF p_customer_id IS DISTINCT FROM c_guest_customer_id THEN
            RAISE EXCEPTION 'Invitados solo pueden ordenar bajo el perfil de invitado';
        END IF;
        v_customer_id := c_guest_customer_id;
    END IF;

    IF array_length(p_cart_items, 1) IS NULL THEN
        RAISE EXCEPTION 'El carrito está vacío';
    END IF;

    IF p_total_amount < 0 THEN
        RAISE EXCEPTION 'El monto total no puede ser negativo';
    END IF;

    -- 2. VERIFICACIÓN Y BLOQUEO DE STOCK CONSOLIDADO
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

    -- 3. INSERTAR EL PEDIDO
    INSERT INTO public.orders (customer_id, total_amount, status, scheduled_for, notes)
    VALUES (v_customer_id, p_total_amount, 'pendiente', p_scheduled_for, p_notes)
    RETURNING public.orders.id, public.orders.status INTO v_new_order_id, v_order_status;

    -- Obtener el código de orden generado por el trigger
    SELECT public.orders.order_code INTO v_new_order_code 
    FROM public.orders 
    WHERE public.orders.id = v_new_order_id;

    -- 4. INSERTAR LOS ITEMS DEL PEDIDO (VALIDANDO PRECIOS REALES DE LA BASE DE DATOS)
    FOR cart_item IN SELECT * FROM unnest(p_cart_items)
    LOOP
        IF cart_item.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
        END IF;

        IF public.is_admin() THEN
            v_item_price := cart_item.price;
            v_item_cost := COALESCE(cart_item.cost, 0);
        ELSE
            -- Obtener precio unitario oficial de public.products y promociones vigentes
            SELECT COALESCE(sp.override_price, prod.price), COALESCE(prod.cost, 0)
            INTO v_item_price, v_item_cost
            FROM public.products prod
            LEFT JOIN LATERAL (
                SELECT override_price
                FROM public.special_prices sp
                WHERE sp.is_active = true
                  AND (sp.product_id = prod.id OR sp.category_id = prod.category_id)
                  AND CURRENT_DATE >= sp.start_date
                  AND (sp.end_date IS NULL OR CURRENT_DATE <= sp.end_date)
                  AND (
                      sp.target_customer_ids IS NULL
                      OR cardinality(sp.target_customer_ids) = 0
                      OR v_customer_id = ANY(sp.target_customer_ids)
                  )
                ORDER BY sp.product_id NULLS LAST, sp.created_at DESC
                LIMIT 1
            ) sp ON true
            WHERE prod.id = cart_item.product_id
              AND (prod.is_active = true OR public.is_admin());

            IF v_item_price IS NULL THEN
                RAISE EXCEPTION 'El producto % no existe o no está disponible', cart_item.product_id;
            END IF;
        END IF;

        INSERT INTO public.order_items (order_id, product_id, quantity, price, cost)
        VALUES (v_new_order_id, cart_item.product_id, cart_item.quantity, v_item_price, v_item_cost);
    END LOOP;

    -- 5. DESCONTAR EL STOCK EN BLOQUE POR INGREDIENTE CONSOLIDADO
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

    -- 6. RETORNO DE INFORMACIÓN AL CLIENTE
    RETURN QUERY 
        SELECT v_new_order_id, v_new_order_code, v_order_status;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamp with time zone, public.cart_item[], character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamp with time zone, public.cart_item[], character varying) TO authenticated, anon, service_role;
