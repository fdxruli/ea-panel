-- Migration: Support linking modifiers to inventory ingredients for exact stock deduction and control
-- Description: Updates create_order_with_stock_check, update_order_with_stock_sync, and return_stock_on_cancellation
--              to calculate, validate, and deduct stock for inventory ingredients configured in selected_modifiers.

-- 1. Actualizar create_order_with_stock_check
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

    -- 1. VERIFICACIÓN Y BLOQUEO DE STOCK CONSOLIDADO (RECETA BASE + COMPLEMENTOS DE INVENTARIO)
    FOR req_ingredient IN
        WITH cart_expanded AS (
            SELECT 
                ci.product_id,
                ci.quantity,
                ci.selected_modifiers
            FROM unnest(p_cart_items) AS ci
        ),
        recipe_needed AS (
            SELECT 
                rec.ingredient_id,
                SUM(ce.quantity * rec.quantity_used) AS total_needed
            FROM cart_expanded ce
            JOIN public.products prod ON ce.product_id = prod.id
            JOIN public.product_recipes rec ON ce.product_id = rec.product_id
            JOIN public.ingredients ing ON rec.ingredient_id = ing.id
            WHERE prod.track_stock = true
              AND ing.track_inventory = true
              AND rec.deduct_stock_automatically = true
            GROUP BY rec.ingredient_id
        ),
        modifiers_needed AS (
            SELECT 
                (mod->>'ingredient_id')::uuid AS ingredient_id,
                SUM(ce.quantity * (mod->>'quantity_used')::numeric) AS total_needed
            FROM cart_expanded ce,
            LATERAL jsonb_array_elements(COALESCE(ce.selected_modifiers, '[]'::jsonb)) AS mod
            JOIN public.ingredients ing ON (mod->>'ingredient_id')::uuid = ing.id
            WHERE mod->>'ingredient_id' IS NOT NULL
              AND mod->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND (mod->>'quantity_used') IS NOT NULL
              AND (mod->>'quantity_used') ~* '^[0-9]+(\.[0-9]+)?$'
              AND (mod->>'quantity_used')::numeric > 0
              AND ing.track_inventory = true
            GROUP BY (mod->>'ingredient_id')::uuid
        ),
        needed_per_ingredient AS (
            SELECT ingredient_id, SUM(total_needed) AS total_needed_for_order
            FROM (
                SELECT ingredient_id, total_needed FROM recipe_needed
                UNION ALL
                SELECT ingredient_id, total_needed FROM modifiers_needed
            ) combined
            GROUP BY ingredient_id
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
            RAISE EXCEPTION 'Stock insuficiente para "%". Se necesitan % % en total para cubrir tu pedido (receta + extras), pero solo quedan % %.', 
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

    -- 4. DESCONTAR EL STOCK EN BLOQUE POR INGREDIENTE CONSOLIDADO (RECETA + COMPLEMENTOS)
    UPDATE public.ingredients ing
    SET current_stock = ing.current_stock - agg.total_deduction
    FROM (
        WITH cart_expanded AS (
            SELECT 
                ci.product_id,
                ci.quantity,
                ci.selected_modifiers
            FROM unnest(p_cart_items) AS ci
        ),
        recipe_deduction AS (
            SELECT 
                rec.ingredient_id,
                SUM(ce.quantity * rec.quantity_used) AS total_deduction
            FROM cart_expanded ce
            JOIN public.products prod ON ce.product_id = prod.id
            JOIN public.product_recipes rec ON ce.product_id = rec.product_id
            JOIN public.ingredients i ON rec.ingredient_id = i.id
            WHERE prod.track_stock = true
              AND i.track_inventory = true
              AND rec.deduct_stock_automatically = true
            GROUP BY rec.ingredient_id
        ),
        modifiers_deduction AS (
            SELECT 
                (mod->>'ingredient_id')::uuid AS ingredient_id,
                SUM(ce.quantity * (mod->>'quantity_used')::numeric) AS total_deduction
            FROM cart_expanded ce,
            LATERAL jsonb_array_elements(COALESCE(ce.selected_modifiers, '[]'::jsonb)) AS mod
            JOIN public.ingredients i ON (mod->>'ingredient_id')::uuid = i.id
            WHERE mod->>'ingredient_id' IS NOT NULL
              AND mod->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND (mod->>'quantity_used') IS NOT NULL
              AND (mod->>'quantity_used') ~* '^[0-9]+(\.[0-9]+)?$'
              AND (mod->>'quantity_used')::numeric > 0
              AND i.track_inventory = true
            GROUP BY (mod->>'ingredient_id')::uuid
        )
        SELECT ingredient_id, SUM(total_deduction) AS total_deduction
        FROM (
            SELECT ingredient_id, total_deduction FROM recipe_deduction
            UNION ALL
            SELECT ingredient_id, total_deduction FROM modifiers_deduction
        ) combined
        GROUP BY ingredient_id
    ) agg
    WHERE ing.id = agg.ingredient_id;

    -- 5. RETORNO DE INFORMACIÓN AL CLIENTE
    RETURN QUERY 
        SELECT v_new_order_id, v_new_order_code, v_order_status;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamp with time zone, public.cart_item[], character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamp with time zone, public.cart_item[], character varying) TO authenticated, anon, service_role;


-- 2. Actualizar update_order_with_stock_sync
CREATE OR REPLACE FUNCTION public.update_order_with_stock_sync(
    p_order_id uuid,
    p_total_amount numeric,
    p_scheduled_for timestamp with time zone,
    p_items jsonb,
    p_notes character varying DEFAULT NULL::character varying
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_current_status public.order_status;
    v_item jsonb;
    req_ingredient RECORD;
BEGIN
    -- 1. Obtener estado actual del pedido con bloqueo
    SELECT status INTO v_current_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado.';
    END IF;

    -- 2. Si el pedido NO está cancelado, revertir el stock de los items actuales (receta + complementos)
    IF v_current_status <> 'cancelado' THEN
        UPDATE public.ingredients ing
        SET current_stock = ing.current_stock + old_stock.total_to_return
        FROM (
            WITH old_recipe_stock AS (
                SELECT 
                    rec.ingredient_id,
                    SUM(oi.quantity * rec.quantity_used) AS total_to_return
                FROM public.order_items oi
                JOIN public.products prod ON oi.product_id = prod.id
                JOIN public.product_recipes rec ON oi.product_id = rec.product_id
                JOIN public.ingredients i ON rec.ingredient_id = i.id
                WHERE oi.order_id = p_order_id
                    AND prod.track_stock = true
                    AND i.track_inventory = true
                    AND rec.deduct_stock_automatically = true
                GROUP BY rec.ingredient_id
            ),
            old_modifier_stock AS (
                SELECT 
                    (mod->>'ingredient_id')::uuid AS ingredient_id,
                    SUM(oi.quantity * (mod->>'quantity_used')::numeric) AS total_to_return
                FROM public.order_items oi,
                LATERAL jsonb_array_elements(COALESCE(oi.selected_modifiers, '[]'::jsonb)) AS mod
                JOIN public.ingredients i ON (mod->>'ingredient_id')::uuid = i.id
                WHERE oi.order_id = p_order_id
                    AND mod->>'ingredient_id' IS NOT NULL
                    AND mod->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND (mod->>'quantity_used') IS NOT NULL
                    AND (mod->>'quantity_used') ~* '^[0-9]+(\.[0-9]+)?$'
                    AND (mod->>'quantity_used')::numeric > 0
                    AND i.track_inventory = true
                GROUP BY (mod->>'ingredient_id')::uuid
            )
            SELECT ingredient_id, SUM(total_to_return) AS total_to_return
            FROM (
                SELECT ingredient_id, total_to_return FROM old_recipe_stock
                UNION ALL
                SELECT ingredient_id, total_to_return FROM old_modifier_stock
            ) combined
            GROUP BY ingredient_id
        ) old_stock
        WHERE ing.id = old_stock.ingredient_id;
    END IF;

    -- 3. Si el pedido NO está cancelado, validar y descontar los NUEVOS items (receta + complementos)
    IF v_current_status <> 'cancelado' AND p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        -- Bloquear y validar el stock requerido por los nuevos items
        FOR req_ingredient IN
            WITH items_expanded AS (
                SELECT 
                    (item->>'product_id')::uuid AS product_id,
                    COALESCE((item->>'quantity')::integer, 1) AS quantity,
                    COALESCE(item->'selected_modifiers', '[]'::jsonb) AS selected_modifiers
                FROM jsonb_array_elements(p_items) AS item
            ),
            recipe_needed AS (
                SELECT 
                    rec.ingredient_id,
                    SUM(ie.quantity * rec.quantity_used) AS total_needed
                FROM items_expanded ie
                JOIN public.products prod ON ie.product_id = prod.id
                JOIN public.product_recipes rec ON ie.product_id = rec.product_id
                JOIN public.ingredients ing ON rec.ingredient_id = ing.id
                WHERE prod.track_stock = true
                    AND ing.track_inventory = true
                    AND rec.deduct_stock_automatically = true
                GROUP BY rec.ingredient_id
            ),
            modifiers_needed AS (
                SELECT 
                    (mod->>'ingredient_id')::uuid AS ingredient_id,
                    SUM(ie.quantity * (mod->>'quantity_used')::numeric) AS total_needed
                FROM items_expanded ie,
                LATERAL jsonb_array_elements(ie.selected_modifiers) AS mod
                JOIN public.ingredients ing ON (mod->>'ingredient_id')::uuid = ing.id
                WHERE mod->>'ingredient_id' IS NOT NULL
                    AND mod->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND (mod->>'quantity_used') IS NOT NULL
                    AND (mod->>'quantity_used') ~* '^[0-9]+(\.[0-9]+)?$'
                    AND (mod->>'quantity_used')::numeric > 0
                    AND ing.track_inventory = true
                GROUP BY (mod->>'ingredient_id')::uuid
            ),
            needed_per_ingredient AS (
                SELECT ingredient_id, SUM(total_needed) AS total_needed_for_order
                FROM (
                    SELECT ingredient_id, total_needed FROM recipe_needed
                    UNION ALL
                    SELECT ingredient_id, total_needed FROM modifiers_needed
                ) combined
                GROUP BY ingredient_id
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
                RAISE EXCEPTION 'Stock insuficiente para "%". Se necesitan % % en total (receta + extras), pero solo quedan % %.',
                    req_ingredient.ingredient_name,
                    req_ingredient.total_needed_for_order,
                    COALESCE(req_ingredient.base_unit, 'unidades'),
                    req_ingredient.current_stock,
                    COALESCE(req_ingredient.base_unit, 'unidades');
            END IF;
        END LOOP;

        -- Descontar el nuevo stock requerido
        UPDATE public.ingredients ing
        SET current_stock = ing.current_stock - agg.total_deduction
        FROM (
            WITH items_expanded AS (
                SELECT 
                    (item->>'product_id')::uuid AS product_id,
                    COALESCE((item->>'quantity')::integer, 1) AS quantity,
                    COALESCE(item->'selected_modifiers', '[]'::jsonb) AS selected_modifiers
                FROM jsonb_array_elements(p_items) AS item
            ),
            recipe_deduction AS (
                SELECT 
                    rec.ingredient_id,
                    SUM(ie.quantity * rec.quantity_used) AS total_deduction
                FROM items_expanded ie
                JOIN public.products prod ON ie.product_id = prod.id
                JOIN public.product_recipes rec ON ie.product_id = rec.product_id
                JOIN public.ingredients i ON rec.ingredient_id = i.id
                WHERE prod.track_stock = true
                    AND i.track_inventory = true
                    AND rec.deduct_stock_automatically = true
                GROUP BY rec.ingredient_id
            ),
            modifiers_deduction AS (
                SELECT 
                    (mod->>'ingredient_id')::uuid AS ingredient_id,
                    SUM(ie.quantity * (mod->>'quantity_used')::numeric) AS total_deduction
                FROM items_expanded ie,
                LATERAL jsonb_array_elements(ie.selected_modifiers) AS mod
                JOIN public.ingredients i ON (mod->>'ingredient_id')::uuid = i.id
                WHERE mod->>'ingredient_id' IS NOT NULL
                    AND mod->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND (mod->>'quantity_used') IS NOT NULL
                    AND (mod->>'quantity_used') ~* '^[0-9]+(\.[0-9]+)?$'
                    AND (mod->>'quantity_used')::numeric > 0
                    AND i.track_inventory = true
                GROUP BY (mod->>'ingredient_id')::uuid
            )
            SELECT ingredient_id, SUM(total_deduction) AS total_deduction
            FROM (
                SELECT ingredient_id, total_deduction FROM recipe_deduction
                UNION ALL
                SELECT ingredient_id, total_deduction FROM modifiers_deduction
            ) combined
            GROUP BY ingredient_id
        ) agg
        WHERE ing.id = agg.ingredient_id;
    END IF;

    -- 4. Reemplazar los order_items
    DELETE FROM public.order_items WHERE order_id = p_order_id;

    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
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
                p_order_id,
                (v_item->>'product_id')::uuid,
                COALESCE((v_item->>'quantity')::integer, 1),
                COALESCE((v_item->>'price')::numeric, 0),
                COALESCE((v_item->>'cost')::numeric, 0),
                COALESCE(v_item->'selected_modifiers', '[]'::jsonb),
                v_item->>'item_notes'
            );
        END LOOP;
    END IF;

    -- 5. Actualizar orden principal
    UPDATE public.orders
    SET 
        total_amount = p_total_amount,
        scheduled_for = p_scheduled_for,
        notes = p_notes,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_order_with_stock_sync(uuid, numeric, timestamp with time zone, jsonb, character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_with_stock_sync(uuid, numeric, timestamp with time zone, jsonb, character varying) TO authenticated, service_role;


-- 3. Actualizar return_stock_on_cancellation para devolver también complementos vinculados a inventario
CREATE OR REPLACE FUNCTION public.return_stock_on_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    item RECORD;
    recipe_ingredient RECORD;
    mod RECORD;
BEGIN
    -- ¿El nuevo estado es 'cancelado' Y el estado antiguo era 'pendiente'?
    IF NEW.status = 'cancelado' AND OLD.status = 'pendiente' THEN
        -- 1. Devolver stock de recetas base y modificadores
        FOR item IN 
            SELECT product_id, quantity, selected_modifiers 
            FROM public.order_items 
            WHERE order_id = OLD.id
        LOOP
            -- Devolver stock de la receta base
            FOR recipe_ingredient IN
                SELECT 
                    rec.ingredient_id, 
                    rec.quantity_used
                FROM public.product_recipes AS rec
                JOIN public.ingredients AS ing ON rec.ingredient_id = ing.id
                JOIN public.products AS prod ON rec.product_id = prod.id
                WHERE rec.product_id = item.product_id
                  AND prod.track_stock = true
                  AND ing.track_inventory = true
                  AND rec.deduct_stock_automatically = true
            LOOP
                UPDATE public.ingredients
                SET current_stock = current_stock + (item.quantity * recipe_ingredient.quantity_used)
                WHERE id = recipe_ingredient.ingredient_id;
            END LOOP;

            -- Devolver stock de los complementos vinculados a inventario
            IF item.selected_modifiers IS NOT NULL AND jsonb_array_length(item.selected_modifiers) > 0 THEN
                FOR mod IN
                    SELECT 
                        (m->>'ingredient_id')::uuid AS ingredient_id,
                        (m->>'quantity_used')::numeric AS quantity_used
                    FROM jsonb_array_elements(item.selected_modifiers) AS m
                    JOIN public.ingredients ing ON (m->>'ingredient_id')::uuid = ing.id
                    WHERE m->>'ingredient_id' IS NOT NULL
                      AND m->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      AND m->>'quantity_used' IS NOT NULL
                      AND m->>'quantity_used' ~* '^[0-9]+(\.[0-9]+)?$'
                      AND (m->>'quantity_used')::numeric > 0
                      AND ing.track_inventory = true
                LOOP
                    UPDATE public.ingredients
                    SET current_stock = current_stock + (item.quantity * mod.quantity_used)
                    WHERE id = mod.ingredient_id;
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$function$;
