-- Migration: Add update_order_with_stock_sync RPC
-- Description: Allows administrators to edit order details and items while atomically syncing
--              ingredient stock (reverting previous item demand, locking and validating new demand, and deducting).

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
SET search_path TO 'public'
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

    -- 2. Si el pedido NO está cancelado, revertir el stock de los items actuales
    IF v_current_status <> 'cancelado' THEN
        UPDATE public.ingredients ing
        SET current_stock = ing.current_stock + old_stock.total_to_return
        FROM (
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
        ) old_stock
        WHERE ing.id = old_stock.ingredient_id;
    END IF;

    -- 3. Si el pedido NO está cancelado, validar y descontar los NUEVOS items
    IF v_current_status <> 'cancelado' AND p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        -- Bloquear y validar el stock requerido por los nuevos items
        FOR req_ingredient IN
            WITH items_expanded AS (
                SELECT 
                    (item->>'product_id')::uuid AS product_id,
                    COALESCE((item->>'quantity')::integer, 1) AS quantity
                FROM jsonb_array_elements(p_items) AS item
            ),
            needed_per_ingredient AS (
                SELECT 
                    rec.ingredient_id,
                    SUM(ie.quantity * rec.quantity_used) AS total_needed_for_order
                FROM items_expanded ie
                JOIN public.products prod ON ie.product_id = prod.id
                JOIN public.product_recipes rec ON ie.product_id = rec.product_id
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
                RAISE EXCEPTION 'Stock insuficiente para "%". Se necesitan % % en total, pero solo quedan % %.',
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
            SELECT 
                rec.ingredient_id,
                SUM(COALESCE((item->>'quantity')::integer, 1) * rec.quantity_used) AS total_deduction
            FROM jsonb_array_elements(p_items) item
            JOIN public.products prod ON (item->>'product_id')::uuid = prod.id
            JOIN public.product_recipes rec ON (item->>'product_id')::uuid = rec.product_id
            JOIN public.ingredients i ON rec.ingredient_id = i.id
            WHERE prod.track_stock = true
                AND i.track_inventory = true
                AND rec.deduct_stock_automatically = true
            GROUP BY rec.ingredient_id
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
                cost
            )
            VALUES (
                p_order_id,
                (v_item->>'product_id')::uuid,
                COALESCE((v_item->>'quantity')::integer, 1),
                COALESCE((v_item->>'price')::numeric, 0),
                COALESCE((v_item->>'cost')::numeric, 0)
            );
        END LOOP;
    END IF;

    -- 5. Actualizar la orden
    UPDATE public.orders
    SET 
        total_amount = p_total_amount,
        scheduled_for = p_scheduled_for,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_order_id;

    RETURN true;
END;
$function$;
