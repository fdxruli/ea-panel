-- FUNCIONES CANDIDATAS BASELINE

-- Function: generate_order_code
CREATE OR REPLACE FUNCTION public.generate_order_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$;
DECLARE
    year_month TEXT;
    random_suffix TEXT;
    new_code TEXT;
    is_unique BOOLEAN := FALSE;
BEGIN
    year_month := TO_CHAR(NOW(), 'MMYY'); -- Formato MesAño, ej: '0925'

    -- Bucle que se ejecutará hasta encontrar un código único
    WHILE NOT is_unique LOOP
        -- Genera un número aleatorio entre 100 y 999
        random_suffix := LPAD(FLOOR(RANDOM() * 900 + 100)::INT::TEXT, 3, '0');
        
        -- Construye el código potencial
        new_code := 'EA-' || year_month || '-' || random_suffix;
        
        -- Verifica si este código ya existe
        PERFORM 1 FROM orders WHERE order_code = new_code;
        
        -- Si no se encontró, el código es único
        IF NOT FOUND THEN
            is_unique := TRUE;
        END IF;
    END LOOP;

    -- Asigna el código único al nuevo pedido
    NEW.order_code := new_code;
    RETURN NEW;
END;
$function$;


-- Function: handle_first_purchase_referral
CREATE OR REPLACE FUNCTION public.handle_first_purchase_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;
DECLARE
  v_referrer_id uuid;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'completado') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'completado' AND (OLD.status IS DISTINCT FROM NEW.status)) THEN

    UPDATE public.customers
    SET has_made_first_purchase = TRUE
    WHERE id = NEW.customer_id
      AND has_made_first_purchase = FALSE
    RETURNING referrer_id INTO v_referrer_id;

    IF FOUND AND v_referrer_id IS NOT NULL THEN
      PERFORM public.increment_referral_count(v_referrer_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


-- Function: refresh_dashboard_stats
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;
BEGIN
    -- CORRECCIÓN: Remover CONCURRENTLY porque la vista tiene solo 1 fila
    REFRESH MATERIALIZED VIEW dashboard_stats;
    RETURN NULL;
END;
$function$;


-- Function: return_stock_on_cancellation
CREATE OR REPLACE FUNCTION public.return_stock_on_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;
DECLARE
    item RECORD;
    recipe_ingredient RECORD;
BEGIN
    -- 1. Comprobar la condición que pediste:
    -- ¿El nuevo estado es 'cancelado' Y el estado antiguo era 'pendiente'?
    IF NEW.status = 'cancelado' AND OLD.status = 'pendiente' THEN
        
        -- 2. Si se cumple, buscar todos los items de ese pedido
        FOR item IN 
            SELECT product_id, quantity 
            FROM public.order_items 
            WHERE order_id = OLD.id
        LOOP
            -- 3. Para cada item, buscar su receta
            FOR recipe_ingredient IN
                SELECT 
                    rec.ingredient_id, 
                    rec.quantity_used
                FROM public.product_recipes AS rec
                JOIN public.ingredients AS ing ON rec.ingredient_id = ing.id
                JOIN public.products AS prod ON rec.product_id = prod.id
                WHERE rec.product_id = item.product_id
                  AND prod.track_stock = true -- Solo de productos que rastrean stock
                  AND ing.track_inventory = true -- Y de ingredientes que rastrean stock
                  AND rec.deduct_stock_automatically = true -- Y de ingredientes que se descuentan
            LOOP
                -- 4. Devolver el stock al inventario
                UPDATE public.ingredients
                SET current_stock = current_stock + (item.quantity * recipe_ingredient.quantity_used)
                WHERE id = recipe_ingredient.ingredient_id;
            END LOOP;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$function$;


-- Function: send_order_notification_on_status_change
CREATE OR REPLACE FUNCTION public.send_order_notification_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$;
BEGIN
  PERFORM
    -- 👇 CORRECCIÓN: Usar net.http_post
    net.http_post(
      url:='https://xvstqhvooabljhhfmuas.functions.supabase.co/send-order-notification', -- Especificar nombre del parámetro
      body:=jsonb_build_object( -- Especificar nombre del parámetro
        'record', to_jsonb(NEW),
        'old_record', to_jsonb(OLD)
      ),
      headers:='{"Content-Type": "application/json"}'::jsonb -- Especificar nombre y tipo del parámetro
    );

  RETURN NEW;
END;
$function$;


-- Function: update_ingredient_stock_on_purchase
CREATE OR REPLACE FUNCTION public.update_ingredient_stock_on_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;
DECLARE
    purchase_unit_factor NUMERIC;
    total_base_units NUMERIC;
    cost_per_unit NUMERIC;
    current_avg_cost NUMERIC;
    current_total_stock NUMERIC;
    new_avg_cost NUMERIC;
    new_total_stock NUMERIC;
BEGIN
    -- 1. Obtener el factor de conversión (ej: "Garrafa" -> 3500)
    SELECT base_units_per_purchase_unit
    INTO purchase_unit_factor
    FROM public.ingredient_purchase_units
    WHERE id = NEW.purchase_unit_id;

    -- 2. Calcular los totales para este lote de compra
    total_base_units := NEW.quantity_purchased * purchase_unit_factor;
    cost_per_unit := NEW.total_cost / total_base_units;

    -- 3. Actualizar la fila de 'ingredient_purchases' (para tu historial)
    UPDATE public.ingredient_purchases
    SET 
        total_base_units_added = total_base_units,
        cost_per_base_unit = cost_per_unit
    WHERE id = NEW.id;

    -- 4. Obtener el stock y costo actuales del ingrediente principal (con bloqueo)
    SELECT average_cost, current_stock
    INTO current_avg_cost, current_total_stock
    FROM public.ingredients
    WHERE id = NEW.ingredient_id
    FOR UPDATE; -- Bloquea esta fila para evitar "carreras"

    -- 5. Calcular el nuevo promedio ponderado y el stock total
    new_total_stock := current_total_stock + total_base_units;
    
    IF new_total_stock > 0 THEN
        new_avg_cost := ((current_avg_cost * current_total_stock) + NEW.total_cost) / new_total_stock;
    ELSE
        new_avg_cost := 0; -- Evitar división por cero si el stock es 0
    END IF;

    -- 6. Actualizar la tabla 'ingredients' (el cerebro)
    UPDATE public.ingredients
    SET 
        current_stock = new_total_stock,
        average_cost = new_avg_cost
    WHERE id = NEW.ingredient_id;

    RETURN NEW;
END;
$function$;


-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$;
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;


-- Function: validate_discount_target
CREATE OR REPLACE FUNCTION public.validate_discount_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$;
BEGIN
    IF NEW.type = 'global' AND NEW.target_id IS NOT NULL THEN
        RAISE EXCEPTION 'Los descuentos globales no pueden tener target_id';
    END IF;
    IF NEW.type = 'category' AND NEW.target_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.target_id) THEN
            RAISE EXCEPTION 'target_id debe corresponder a una categoría válida';
        END IF;
    END IF;
    IF NEW.type = 'product' AND NEW.target_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM products WHERE id = NEW.target_id) THEN
            RAISE EXCEPTION 'target_id debe corresponder a un producto válido';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;



-- Function: increment_referral_count
CREATE OR REPLACE FUNCTION public.increment_referral_count(p_referrer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$;
BEGIN
  RAISE NOTICE '[increment_referral_count] Intentando incrementar contador para ID: %', p_referrer_id;
  UPDATE public.customers
  SET referral_count = referral_count + 1
  WHERE id = p_referrer_id;

  IF FOUND THEN
    RAISE NOTICE '[increment_referral_count] Contador incrementado exitosamente para ID: %', p_referrer_id;
  ELSE
    RAISE NOTICE '[increment_referral_count] ADVERTENCIA: No se encontró cliente con ID % para incrementar contador.', p_referrer_id;
  END IF;
END;
$function$;

-- Function: adjust_ingredient_stock
CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock(p_ingredient_id uuid, p_adjustment_amount numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$;
BEGIN
    UPDATE public.ingredients
    SET current_stock = current_stock + p_adjustment_amount
    WHERE id = p_ingredient_id;
END;
$function$;

-- Function: create_order_with_stock_check
CREATE OR REPLACE FUNCTION public.create_order_with_stock_check(
    p_customer_id uuid,
    p_total_amount numeric,
    p_scheduled_for timestamp with time zone,
    p_cart_items cart_item[],
    p_notes character varying DEFAULT NULL::character varying
)
RETURNS TABLE(order_id uuid, order_code character varying, order_status order_status)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$;
DECLARE
    v_new_order_id uuid;
    v_new_order_code character varying;
    v_order_status public.order_status;
    cart_item public.cart_item;
    req_ingredient RECORD;
BEGIN
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
    VALUES (p_customer_id, p_total_amount, 'pendiente', p_scheduled_for, p_notes)
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
