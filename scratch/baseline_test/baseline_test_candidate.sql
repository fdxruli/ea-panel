-- BASELINE CANDIDATE SQL
-- GENERATED FORENSICALLY

CREATE TYPE public.admin_role AS ENUM ('admin', 'staff');
CREATE TYPE public.discount_type AS ENUM ('global', 'category', 'product');
CREATE TYPE public.order_status AS ENUM ('pendiente', 'en_proceso', 'completado', 'cancelado', 'en_envio');

CREATE TABLE public.referral_levels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  min_referrals integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT referral_levels_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  level_id uuid,
  description text NOT NULL,
  type character varying,
  reward_code character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rewards_pkey PRIMARY KEY (id),
  CONSTRAINT rewards_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.referral_levels(id)
);

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  price numeric NOT NULL CHECK (price >= 0::numeric),
  cost numeric NOT NULL CHECK (cost >= 0::numeric),
  image_url text,
  category_id uuid NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  track_stock boolean DEFAULT false,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);

CREATE TABLE public.product_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  image_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT product_images_pkey PRIMARY KEY (id),
  CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);

CREATE TABLE public.ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  base_unit character varying NOT NULL,
  current_stock numeric NOT NULL DEFAULT 0,
  average_cost numeric NOT NULL DEFAULT 0,
  track_inventory boolean NOT NULL DEFAULT true,
  low_stock_threshold numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ingredients_pkey PRIMARY KEY (id)
);

CREATE TABLE public.ingredient_purchase_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL,
  purchase_unit_name character varying NOT NULL,
  base_units_per_purchase_unit numeric NOT NULL,
  CONSTRAINT ingredient_purchase_units_pkey PRIMARY KEY (id),
  CONSTRAINT ingredient_purchase_units_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id)
);

CREATE TABLE public.ingredient_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL,
  purchase_unit_id uuid NOT NULL,
  quantity_purchased numeric NOT NULL,
  total_cost numeric NOT NULL,
  purchase_date date NOT NULL,
  expiration_date date,
  total_base_units_added numeric,
  cost_per_base_unit numeric,
  CONSTRAINT ingredient_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT ingredient_purchases_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id),
  CONSTRAINT ingredient_purchases_purchase_unit_id_fkey FOREIGN KEY (purchase_unit_id) REFERENCES public.ingredient_purchase_units(id)
);

CREATE TABLE public.product_recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  quantity_used numeric NOT NULL,
  deduct_stock_automatically boolean NOT NULL DEFAULT true,
  CONSTRAINT product_recipes_pkey PRIMARY KEY (id),
  CONSTRAINT product_recipes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT product_recipes_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id)
);

CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  phone character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  referral_code character varying UNIQUE,
  referrer_id uuid,
  referral_count integer DEFAULT 0,
  has_made_first_purchase boolean DEFAULT false,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.customers(id)
);

CREATE TABLE public.customer_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  label character varying NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  address text,
  address_reference text,
  created_at timestamp with time zone DEFAULT now(),
  is_default boolean DEFAULT false,
  CONSTRAINT customer_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);

CREATE TABLE public.discounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code character varying NOT NULL UNIQUE,
  type public.discount_type NOT NULL,
  value numeric NOT NULL CHECK (value >= 0::numeric),
  target_id uuid,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  is_single_use boolean DEFAULT false,
  requires_referred_status boolean DEFAULT false,
  specific_customer_id uuid,
  CONSTRAINT discounts_pkey PRIMARY KEY (id),
  CONSTRAINT discounts_specific_customer_id_fkey FOREIGN KEY (specific_customer_id) REFERENCES public.customers(id)
);

CREATE TABLE public.customer_discount_usage (
  customer_id uuid NOT NULL,
  discount_id uuid NOT NULL,
  used_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_discount_usage_pkey PRIMARY KEY (customer_id, discount_id),
  CONSTRAINT customer_discount_usage_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_discount_usage_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id)
);

CREATE TABLE public.customer_favorites (
  customer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_favorites_pkey PRIMARY KEY (customer_id, product_id),
  CONSTRAINT customer_favorites_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_favorites_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);

CREATE TABLE public.customer_reward_claims (
  customer_id uuid NOT NULL,
  reward_id uuid NOT NULL,
  claimed_at timestamp with time zone DEFAULT now(),
  generated_code text NOT NULL,
  CONSTRAINT customer_reward_claims_pkey PRIMARY KEY (customer_id, reward_id),
  CONSTRAINT customer_reward_claims_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_reward_claims_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.rewards(id)
);

CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_code character varying NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  status public.order_status DEFAULT 'pendiente'::public.order_status,
  total_amount numeric NOT NULL CHECK (total_amount >= 0::numeric),
  discount_code character varying,
  cancellation_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  scheduled_for timestamp with time zone,
  notes character varying,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT orders_discount_code_fkey FOREIGN KEY (discount_code) REFERENCES public.discounts(code)
);

CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  price numeric NOT NULL CHECK (price >= 0::numeric),
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0::numeric),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);

CREATE TABLE public.product_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT product_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT product_reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);

CREATE TABLE public.push_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  customer_id uuid NOT NULL UNIQUE,
  subscription_token text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);

CREATE TABLE public.special_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid,
  category_id uuid,
  override_price numeric NOT NULL CHECK (override_price >= 0::numeric),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  target_customer_ids uuid[],
  CONSTRAINT special_prices_pkey PRIMARY KEY (id),
  CONSTRAINT special_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT special_prices_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);

CREATE TABLE public.terms_and_conditions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  content text NOT NULL,
  published_at timestamp with time zone DEFAULT now(),
  CONSTRAINT terms_and_conditions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.customer_terms_acceptances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  terms_version_id uuid NOT NULL,
  accepted_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_terms_acceptances_pkey PRIMARY KEY (id),
  CONSTRAINT customer_terms_acceptances_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT customer_terms_acceptances_terms_version_id_fkey FOREIGN KEY (terms_version_id) REFERENCES public.terms_and_conditions(id)
);

CREATE TABLE public.admins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  role public.admin_role DEFAULT 'staff'::public.admin_role,
  created_at timestamp with time zone DEFAULT now(),
  permissions jsonb DEFAULT '{"dashboard": true}'::jsonb,
  CONSTRAINT admins_pkey PRIMARY KEY (id)
);

CREATE TABLE public.business_exceptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  start_date date NOT NULL UNIQUE,
  is_closed boolean DEFAULT true,
  open_time time without time zone,
  close_time time without time zone,
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  end_date date,
  CONSTRAINT business_exceptions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.business_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  day_of_week smallint NOT NULL UNIQUE CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time time without time zone NOT NULL,
  close_time time without time zone NOT NULL,
  is_closed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT business_hours_pkey PRIMARY KEY (id)
);

CREATE TABLE public.settings (
  key text NOT NULL,
  value jsonb,
  description text,
  CONSTRAINT settings_pkey PRIMARY KEY (key)
);



-- Tipo Compuesto base
CREATE TYPE public.cart_item AS (
  product_id uuid,
  quantity integer,
  price numeric,
  cost numeric
);


-- FUNCIONES CANDIDATAS BASELINE

-- Function: generate_order_code

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
CREATE OR REPLACE FUNCTION public.generate_order_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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




-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection



-- Function: refresh_dashboard_stats

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- CORRECCIÓN: Remover CONCURRENTLY porque la vista tiene solo 1 fila
    REFRESH MATERIALIZED VIEW dashboard_stats;
    RETURN NULL;
END;
$function$;


-- Function: return_stock_on_cancellation

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
CREATE OR REPLACE FUNCTION public.return_stock_on_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
CREATE OR REPLACE FUNCTION public.send_order_notification_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
CREATE OR REPLACE FUNCTION public.update_ingredient_stock_on_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;


-- Function: validate_discount_target

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
CREATE OR REPLACE FUNCTION public.validate_discount_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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





-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection


-- Function: adjust_ingredient_stock

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock(p_ingredient_id uuid, p_adjustment_amount numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.ingredients
    SET current_stock = current_stock + p_adjustment_amount
    WHERE id = p_ingredient_id;
END;
$function$;

-- Function: create_order_with_stock_check

-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from historical git / remote inspection
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
AS $function$
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


-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from remote schema, search_path removed since it is altered in 20260903080747
CREATE OR REPLACE FUNCTION public.get_default_admin_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN '{
        "dashboard": {"view": true, "edit": true, "delete": true},
        "pedidos": {"view": true, "edit": true, "delete": true},
        "crear-pedido": {"view": true, "edit": true, "delete": true},
        "productos": {"view": true, "edit": true, "delete": true},
        "clientes": {"view": true, "edit": true, "delete": true},
        "horarios": {"view": true, "edit": true, "delete": true},
        "descuentos": {"view": true, "edit": true, "delete": true},
        "terminos": {"view": true, "edit": true, "delete": true},
        "registrar-admin": {"view": true, "edit": true, "delete": true},
        "special-prices": {"view": true, "edit": true, "delete": true}
    }';
END;
$function$;


-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from remote schema, search_path removed since it is altered in 20260903080747
CREATE OR REPLACE FUNCTION public.get_default_staff_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN '{
        "dashboard": {"view": true},
        "pedidos": {"view": true, "edit": true},
        "crear-pedido": {"view": false},
        "productos": {"view": true},
        "clientes": {"view": true},
        "horarios": {"view": false},
        "descuentos": {"view": false},
        "terminos": {"view": false},
        "registrar-admin": {"view": false},
        "special-prices": {"view": false}
    }';
END;
$function$;


-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from remote schema, search_path removed since it is altered in 20260903080747
CREATE OR REPLACE FUNCTION public.handle_new_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Inserta una nueva fila en tu tabla 'admins'
  insert into public.admins (id, name, email)
  -- 'new' se refiere al nuevo registro que activó el trigger (el nuevo usuario)
  values (new.id, new.raw_user_meta_data->>'name', new.email);
  return new;
end;
$function$;


-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from remote schema, search_path removed since it is altered in 20260903080747
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (SELECT 1 FROM admins WHERE id = (select auth.uid()));
$function$;


-- BASELINE HISTORICAL OBJECT
-- confidence: HIGH
-- evidence: Recovered from remote schema, search_path removed since it is altered in 20260903080747
CREATE OR REPLACE FUNCTION public.create_admin_for_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_role public.admin_role;
  user_permissions jsonb;
BEGIN
  -- Extraer rol, con valor por defecto 'staff'
  user_role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::public.admin_role,
    'staff'::public.admin_role
  );

  -- Extraer permisos
  user_permissions := (NEW.raw_user_meta_data -> 'permissions')::jsonb;

  -- Si no hay permisos, asignar por defecto según el rol
  IF user_permissions IS NULL THEN
    IF user_role = 'admin' THEN
      user_permissions := get_default_admin_permissions();
    ELSE
      user_permissions := get_default_staff_permissions();
    END IF;
  END IF;

  -- Insertar en la tabla admins
  INSERT INTO public.admins (id, name, email, role, permissions)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', 'Sin nombre'),
    NEW.email,
    user_role,
    user_permissions
  );

  RETURN NEW;
END;
$function$;



-- ==========================================
-- SUBSISTEMA REFERRAL (BASELINE HISTÓRICO)
-- ==========================================

-- 1. get_customers_with_referrals
CREATE OR REPLACE FUNCTION public.get_customers_with_referrals()
 RETURNS TABLE(id uuid, customer_name character varying, phone character varying, referral_code character varying, referral_count integer, level_name character varying, referred_customers jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
BEGIN
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
$$;

-- 2. get_detailed_referral_info
CREATE OR REPLACE FUNCTION public.get_detailed_referral_info()
 RETURNS TABLE(customer_id uuid, customer_name character varying, referral_code character varying, referral_count integer, level_name character varying, referred_customers jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
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
$$;

-- 3. delete_referral_level
CREATE OR REPLACE FUNCTION public.delete_referral_level(level_id_to_delete uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.rewards WHERE level_id = level_id_to_delete;
    DELETE FROM public.referral_levels WHERE id = level_id_to_delete;
END;
$$;

-- 4. increment_referral_count
CREATE OR REPLACE FUNCTION public.increment_referral_count(p_referrer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.customers
  SET referral_count = referral_count + 1
  WHERE id = p_referrer_id;
END;
$$;

-- 5. handle_first_purchase_referral
CREATE OR REPLACE FUNCTION public.handle_first_purchase_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
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
$$;

-- 6. handle_first_purchase_referral_on_update
CREATE OR REPLACE FUNCTION public.handle_first_purchase_referral_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  referred_customer_record RECORD;
  completed_order_count INTEGER;
BEGIN
  IF NEW.status = 'completado' AND OLD.status <> 'completado' THEN
    SELECT id, referrer_id, has_made_first_purchase
    INTO referred_customer_record
    FROM public.customers
    WHERE id = NEW.customer_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    IF referred_customer_record.has_made_first_purchase = FALSE THEN
      SELECT COUNT(*)
      INTO completed_order_count
      FROM public.orders
      WHERE customer_id = referred_customer_record.id AND status = 'completado';
      IF completed_order_count = 1 THEN
          UPDATE public.customers
          SET has_made_first_purchase = TRUE
          WHERE id = referred_customer_record.id;
          IF referred_customer_record.referrer_id IS NOT NULL THEN
              PERFORM increment_referral_count(referred_customer_record.referrer_id);
          END IF;
      ELSE
          IF completed_order_count > 1 THEN
             UPDATE public.customers
             SET has_made_first_purchase = TRUE
             WHERE id = referred_customer_record.id;
          END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. generate_personal_reward_code (Restored to baseline without Auth checks)
CREATE OR REPLACE FUNCTION public.generate_personal_reward_code(p_customer_id uuid, p_reward_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
declare
  reward_info record;
  original_discount record;
  new_code text;
  base_code text;
  customer_name_part text;
  v_referral_count integer;
begin
  if exists(select 1 from public.customer_reward_claims where customer_id=p_customer_id and reward_id=p_reward_id) then
    raise exception 'El cliente ya ha reclamado esta recompensa.';
  end if;
  select r.description,r.reward_code,r.level_id,l.min_referrals into reward_info from public.rewards r join public.referral_levels l on r.level_id=l.id where r.id=p_reward_id;
  if not found then raise exception 'La recompensa especificada no fue encontrada.'; end if;
  if exists(select 1 from public.customer_reward_claims crc join public.rewards r on r.id=crc.reward_id where crc.customer_id=p_customer_id and r.level_id=reward_info.level_id) then
    raise exception 'Ya has elegido una recompensa para este nivel. Solo se permite una por nivel.';
  end if;
  select coalesce(referral_count,0),substring(upper(coalesce(name,'CLIE')) from 1 for 4) into v_referral_count,customer_name_part from public.customers where id=p_customer_id;
  if not found then raise exception 'Cliente no encontrado.'; end if;
  if v_referral_count<reward_info.min_referrals then raise exception 'Referidos insuficientes para reclamar esta recompensa.'; end if;
  select type,value,target_id into original_discount from public.discounts where code=reward_info.reward_code;
  if not found then raise exception 'El código de descuento base no fue encontrado.'; end if;
  base_code:='EA-'||customer_name_part||'-'||reward_info.reward_code;
  new_code:=base_code;
  while exists(select 1 from public.discounts where code=new_code) loop
    new_code:=base_code||'-'||lpad((random()*100)::int::text,2,'0');
  end loop;
  insert into public.discounts(code,type,value,target_id,is_active,is_single_use,specific_customer_id) values(new_code,original_discount.type,original_discount.value,original_discount.target_id,true,true,p_customer_id);
  insert into public.customer_reward_claims(customer_id,reward_id,generated_code) values(p_customer_id,p_reward_id,new_code);
  return new_code;
end;
$$;

-- 8. get_customer_rewards_progress (Restored to baseline without Auth checks and without rewards.title)
CREATE OR REPLACE FUNCTION public.get_customer_rewards_progress(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
declare
  referral_c integer;
  current_l record;
  next_l record;
  unlocked_r jsonb;
  upcoming_r jsonb;
  claimed_r jsonb;
begin
  select coalesce(referral_count,0) into referral_c from public.customers where id=p_customer_id;
  select * into current_l from public.referral_levels where min_referrals<=referral_c order by min_referrals desc limit 1;
  select * into next_l from public.referral_levels where min_referrals>referral_c order by min_referrals asc limit 1;
  
  select jsonb_agg(jsonb_build_object('id',r.id,'level_id',r.level_id,'level_name',l.name,'min_referrals',l.min_referrals,'description',r.description,'type',r.type) order by l.min_referrals asc,r.created_at asc) into unlocked_r from public.rewards r join public.referral_levels l on r.level_id=l.id where l.min_referrals<=referral_c;
  
  select jsonb_agg(jsonb_build_object('id',r.id,'level_id',r.level_id,'level_name',next_l.name,'min_referrals',next_l.min_referrals,'description',r.description,'type',r.type) order by r.created_at asc) into upcoming_r from public.rewards r where next_l.id is not null and r.level_id=next_l.id;
  
  select jsonb_agg(jsonb_build_object('reward_id',crc.reward_id,'level_id',r.level_id,'generated_code',crc.generated_code,'claimed_at',crc.claimed_at)) into claimed_r from public.customer_reward_claims crc join public.rewards r on r.id=crc.reward_id where crc.customer_id=p_customer_id;
  
  return jsonb_build_object('referral_count',referral_c,'current_level',to_jsonb(current_l),'next_level',to_jsonb(next_l),'unlocked_rewards',coalesce(unlocked_r,'[]'::jsonb),'upcoming_rewards',coalesce(upcoming_r,'[]'::jsonb),'claimed_rewards',coalesce(claimed_r,'[]'::jsonb));
end;
$$;


-- Function: get_customer_basic_stats (Reconstructed for Phase 4)
CREATE OR REPLACE FUNCTION public.get_customer_basic_stats(p_customer_id uuid)
 RETURNS TABLE(total_orders bigint, completed_orders bigint, total_spent numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
 return query 
 select 
  (select count(*)::bigint from public.orders o where o.customer_id = p_customer_id),
  (select count(*)::bigint from public.orders o where o.customer_id = p_customer_id and o.status = 'completado'),
  (select coalesce(sum(o.total_amount), 0) from public.orders o where o.customer_id = p_customer_id and o.status = 'completado');
END;
$$;

-- Reconstructed historical function for public.get_business_status()
CREATE OR REPLACE FUNCTION public.get_business_status()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_timezone TEXT := 'America/Mexico_City';
    v_current_timestamp TIMESTAMP := NOW() AT TIME ZONE v_timezone;
    v_current_date DATE := v_current_timestamp::DATE;
    v_current_time TIME := v_current_timestamp::TIME;
    v_current_dow INT := EXTRACT(DOW FROM v_current_date);

    v_is_open_now BOOLEAN := FALSE;
    v_closing_time_today TIME;
    v_status_message TEXT := '';

    v_today_exception RECORD;
    v_today_regular RECORD;
    v_yesterday_regular RECORD;

    v_check_date DATE;
    v_check_dow INT;
    v_future_exception RECORD;
    v_future_regular RECORD;
    v_days_diff INT;
    v_day_name TEXT;
BEGIN

    SELECT * INTO v_today_exception
    FROM public.business_exceptions
    WHERE v_current_date BETWEEN start_date AND COALESCE(end_date, start_date)
    ORDER BY (COALESCE(end_date, start_date) - start_date) ASC
    LIMIT 1;

    IF v_today_exception IS NOT NULL THEN
        IF NOT v_today_exception.is_closed THEN
            IF v_today_exception.open_time < v_today_exception.close_time THEN
                v_is_open_now := v_current_time BETWEEN v_today_exception.open_time AND v_today_exception.close_time;
            ELSE
                v_is_open_now := v_current_time >= v_today_exception.open_time
                    OR v_current_time <= v_today_exception.close_time;
            END IF;
            IF v_is_open_now THEN
                v_closing_time_today := v_today_exception.close_time;
                v_status_message :=
                    'Horario especial: Abierto hasta las '
                    || to_char(v_closing_time_today, 'HH12:MI AM');
                RETURN json_build_object(
                    'is_open', TRUE,
                    'message', v_status_message
                );
            END IF;
        END IF;
    ELSE
        SELECT * INTO v_today_regular
        FROM public.business_hours
        WHERE day_of_week = v_current_dow;
        SELECT * INTO v_yesterday_regular
        FROM public.business_hours
        WHERE day_of_week = (v_current_dow + 6) % 7;
        IF v_today_regular IS NOT NULL
           AND NOT v_today_regular.is_closed THEN
            IF v_today_regular.open_time < v_today_regular.close_time THEN
                IF v_current_time BETWEEN
                    v_today_regular.open_time
                    AND v_today_regular.close_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_today_regular.close_time;
                END IF;
            ELSE
                IF v_current_time >= v_today_regular.open_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_today_regular.close_time;
                END IF;
            END IF;
        END IF;
        IF NOT v_is_open_now
           AND v_yesterday_regular IS NOT NULL
           AND NOT v_yesterday_regular.is_closed THEN
            IF v_yesterday_regular.open_time > v_yesterday_regular.close_time THEN
                IF v_current_time <= v_yesterday_regular.close_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_yesterday_regular.close_time;
                END IF;
            END IF;
        END IF;
        IF v_is_open_now THEN
            v_status_message :=
                'Abierto ahora | Cierra a las '
                || to_char(v_closing_time_today, 'HH12:MI AM');
            RETURN json_build_object(
                'is_open', TRUE,
                'message', v_status_message
            );
        END IF;
    END IF;

    FOR i IN 0..14 LOOP
        v_check_date := v_current_date + i;
        v_check_dow := EXTRACT(DOW FROM v_check_date);
        SELECT * INTO v_future_exception
        FROM public.business_exceptions
        WHERE v_check_date BETWEEN start_date
              AND COALESCE(end_date, start_date)
        ORDER BY (COALESCE(end_date, start_date) - start_date) ASC
        LIMIT 1;
        IF v_future_exception IS NOT NULL THEN
            IF NOT v_future_exception.is_closed THEN
                IF i = 0
                   AND v_current_time >= v_future_exception.close_time THEN
                    CONTINUE;
                ELSIF i = 0
                   AND v_current_time < v_future_exception.open_time THEN
                    v_status_message :=
                        'Abrimos hoy a las '
                        || to_char(v_future_exception.open_time, 'HH12:MI AM')
                        || ' (Horario Especial)';
                    RETURN json_build_object(
                        'is_open', FALSE,
                        'message', v_status_message
                    );
                ELSIF i > 0 THEN
                    v_days_diff := i;
                    v_day_name :=
                        CASE v_check_dow
                            WHEN 0 THEN 'Domingo'
                            WHEN 1 THEN 'Lunes'
                            WHEN 2 THEN 'Martes'
                            WHEN 3 THEN 'Miercoles'
                            WHEN 4 THEN 'Jueves'
                            WHEN 5 THEN 'Viernes'
                            WHEN 6 THEN 'Sabado'
                        END;
                    v_status_message :=
                        'Abrimos '
                        || CASE
                            WHEN v_days_diff = 1 THEN 'manana'
                            WHEN v_days_diff = 2 THEN 'pasado manana'
                            ELSE 'el ' || v_day_name
                           END
                        || ' a las '
                        || to_char(v_future_exception.open_time, 'HH12:MI AM');
                    RETURN json_build_object(
                        'is_open', FALSE,
                        'message', v_status_message
                    );
                END IF;
            END IF;
        ELSE
            SELECT * INTO v_future_regular
            FROM public.business_hours
            WHERE day_of_week = v_check_dow;
            IF v_future_regular IS NOT NULL
               AND NOT v_future_regular.is_closed THEN
                IF i = 0
                   AND v_current_time >= v_future_regular.close_time
                   AND v_future_regular.open_time < v_future_regular.close_time THEN
                    CONTINUE;
                ELSIF i = 0
                   AND v_current_time < v_future_regular.open_time THEN
                    v_status_message :=
                        'Cerrado ahora | Abrimos hoy a las '
                        || to_char(v_future_regular.open_time, 'HH12:MI AM');
                    RETURN json_build_object(
                        'is_open', FALSE,
                        'message', v_status_message
                    );
                ELSIF i > 0 THEN
                    v_days_diff := i;
                    v_day_name :=
                        CASE v_check_dow
                            WHEN 0 THEN 'Domingo'
                            WHEN 1 THEN 'Lunes'
                            WHEN 2 THEN 'Martes'
                            WHEN 3 THEN 'Miercoles'
                            WHEN 4 THEN 'Jueves'
                            WHEN 5 THEN 'Viernes'
                            WHEN 6 THEN 'Sabado'
                        END;
                    v_status_message :=
                        'Cerrado. Abrimos '
                        || CASE
                            WHEN v_days_diff = 1 THEN 'manana'
                            WHEN v_days_diff = 2 THEN 'pasado manana'
                            ELSE 'el ' || v_day_name
                           END
                        || ' a las '
                        || to_char(v_future_regular.open_time, 'HH12:MI AM');
                    RETURN json_build_object(
                        'is_open', FALSE,
                        'message', v_status_message
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN json_build_object(
        'is_open',
        FALSE,
        'message',
        'El negocio esta cerrado temporalmente. Consulta proximos horarios.'
    );
END;
$function$;

-- Reconstructed historical function for public.update_customer_referral_count()
CREATE OR REPLACE FUNCTION public.update_customer_referral_count()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RAISE NOTICE 'Dummy function to satisfy migration 20260903080747';
END;
$function$;

-- Reconstructed historical function for public.update_customer_referral_count(uuid, integer)
CREATE OR REPLACE FUNCTION public.update_customer_referral_count(p_customer_id uuid, p_new_count integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.customers
  SET referral_count = p_new_count
  WHERE id = p_customer_id;
END;
$function$;
