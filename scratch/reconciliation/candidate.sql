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


-- =====================
-- CUTOFF TYPES
-- =====================
CREATE TYPE public.cart_item AS (
  product_id uuid,
  quantity integer,
  price numeric,
  cost numeric
);



-- =====================

-- =====================
-- CUTOFF VIEWS
-- =====================
CREATE MATERIALIZED VIEW public.dashboard_stats AS
 SELECT count(*) AS total_orders,
    count(*) FILTER (WHERE (status = 'pendiente'::order_status)) AS pending_orders,
    sum(total_amount) FILTER (WHERE (status = 'completado'::order_status)) AS total_revenue,
    ( SELECT count(*) AS count
           FROM customers) AS total_customers
   FROM orders;

CREATE OR REPLACE VIEW public.order_profits AS
 SELECT o.id AS order_id,
    o.order_code,
    o.customer_id,
    o.status,
    o.total_amount,
    o.created_at,
    sum(((oi.price - p.cost) * oi.quantity::numeric)) AS total_profit_without_discount,
    sum((oi.price * oi.quantity::numeric)) AS subtotal,
    COALESCE(o.total_amount, sum((oi.price * oi.quantity::numeric))) AS final_total,
    (sum((oi.price * oi.quantity::numeric)) - o.total_amount) AS discount_applied,
    (o.total_amount - sum((p.cost * oi.quantity::numeric))) AS total_profit
   FROM public.orders o
   JOIN public.order_items oi ON o.id = oi.order_id
   JOIN public.products p ON oi.product_id = p.id
  GROUP BY o.id, o.order_code, o.customer_id, o.status, o.total_amount, o.created_at;

-- CUTOFF FUNCTIONS
-- =====================

CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock(p_ingredient_id uuid, p_adjustment_amount numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
BEGIN
    -- Actualizar el stock
    UPDATE public.ingredients
    SET current_stock = current_stock + p_adjustment_amount
    WHERE id = p_ingredient_id;

    -- (Opcional, pero recomendado) Registrar el ajuste en un historial
    -- Si no tienes una tabla de 'stock_adjustments', puedes ignorar esta parte.
    -- INSERT INTO public.stock_adjustments (ingredient_id, amount, reason)
    -- VALUES (p_ingredient_id, p_adjustment_amount, p_reason);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_admin_for_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
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

  -- Si no hay permisos, asignar por defecto segÃƒÂºn el rol
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_referral_level(level_id_to_delete uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
BEGIN
    -- Primero, elimina las recompensas asociadas a ese nivel
    DELETE FROM public.rewards WHERE level_id = level_id_to_delete;
    -- Luego, elimina el nivel
    DELETE FROM public.referral_levels WHERE id = level_id_to_delete;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_order_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$function$
DECLARE
    year_month TEXT;
    random_suffix TEXT;
    new_code TEXT;
    is_unique BOOLEAN := FALSE;
BEGIN
    year_month := TO_CHAR(NOW(), 'MMYY'); -- Formato MesAÃƒÂ±o, ej: '0925'

    -- Bucle que se ejecutarÃƒÂ¡ hasta encontrar un cÃƒÂ³digo ÃƒÂºnico
    WHILE NOT is_unique LOOP
        -- Genera un nÃƒÂºmero aleatorio entre 100 y 999
        random_suffix := LPAD(FLOOR(RANDOM() * 900 + 100)::INT::TEXT, 3, '0');
        
        -- Construye el cÃƒÂ³digo potencial
        new_code := 'EA-' || year_month || '-' || random_suffix;
        
        -- Verifica si este cÃƒÂ³digo ya existe
        PERFORM 1 FROM orders WHERE order_code = new_code;
        
        -- Si no se encontrÃƒÂ³, el cÃƒÂ³digo es ÃƒÂºnico
        IF NOT FOUND THEN
            is_unique := TRUE;
        END IF;
    END LOOP;

    -- Asigna el cÃƒÂ³digo ÃƒÂºnico al nuevo pedido
    NEW.order_code := new_code;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_business_status()
 RETURNS json
 LANGUAGE plpgsql
AS $$function$
DECLARE
    v_timezone TEXT := 'America/Mexico_City';
    v_current_timestamp TIMESTAMP := NOW() AT TIME ZONE v_timezone;
    v_current_date DATE := v_current_timestamp::DATE;
    v_current_time TIME := v_current_timestamp::TIME;
    v_current_dow INT := EXTRACT(DOW FROM v_current_date);
    
    -- Variables de estado actual
    v_is_open_now BOOLEAN := FALSE;
    v_closing_time_today TIME;
    v_status_message TEXT := '';
    
    -- Variables para consultas
    v_today_exception RECORD;
    v_today_regular RECORD;
    v_yesterday_regular RECORD;
    
    -- Variables para proyecciÃƒÂ³n futura
    v_check_date DATE;
    v_check_dow INT;
    v_future_exception RECORD;
    v_future_regular RECORD;
    v_days_diff INT;
    v_day_name TEXT;
BEGIN

    -- =====================================================
    -- FASE 1: Ã‚Â¿ESTAMOS ABIERTOS EN ESTE EXACTO MOMENTO?
    -- =====================================================
    
    -- 1.1 Buscar excepciÃƒÂ³n para HOY. 
    -- ORDER BY asegura determinismo: la excepciÃƒÂ³n mÃƒÂ¡s corta (mÃƒÂ¡s especÃƒÂ­fica) gana.
    SELECT * INTO v_today_exception
    FROM public.business_exceptions
    WHERE v_current_date BETWEEN start_date AND COALESCE(end_date, start_date)
    ORDER BY (COALESCE(end_date, start_date) - start_date) ASC 
    LIMIT 1;

    IF v_today_exception IS NOT NULL THEN
        -- Reglas de la excepciÃƒÂ³n dictan el dÃƒÂ­a
        IF NOT v_today_exception.is_closed THEN
            -- ExcepciÃƒÂ³n marca abierto. Manejamos cruce de medianoche en el horario especial.
            IF v_today_exception.open_time < v_today_exception.close_time THEN
                v_is_open_now := v_current_time BETWEEN v_today_exception.open_time AND v_today_exception.close_time;
            ELSE
                v_is_open_now := v_current_time >= v_today_exception.open_time OR v_current_time <= v_today_exception.close_time;
            END IF;
            IF v_is_open_now THEN
                v_closing_time_today := v_today_exception.close_time;
                v_status_message := 'Horario especial: Abierto hasta las ' || to_char(v_closing_time_today, 'HH12:MI AM');
                RETURN json_build_object('is_open', TRUE, 'message', v_status_message);
            END IF;
        END IF;
    ELSE
        -- 1.2 No hay excepciÃƒÂ³n. Evaluamos el horario regular de HOY y AYER (por turnos nocturnos)
        SELECT * INTO v_today_regular FROM public.business_hours WHERE day_of_week = v_current_dow;
        SELECT * INTO v_yesterday_regular FROM public.business_hours WHERE day_of_week = (v_current_dow + 6) % 7;

        -- Ã‚Â¿Estamos dentro del turno de HOY?
        IF v_today_regular IS NOT NULL AND NOT v_today_regular.is_closed THEN
            IF v_today_regular.open_time < v_today_regular.close_time THEN
                -- Horario normal (ej. 09:00 a 18:00)
                IF v_current_time BETWEEN v_today_regular.open_time AND v_today_regular.close_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_today_regular.close_time;
                END IF;
            ELSE
                -- Horario cruza medianoche (ej. 20:00 a 03:00). Si es mayor a open_time, estamos en el inicio del turno.
                IF v_current_time >= v_today_regular.open_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_today_regular.close_time;
                END IF;
            END IF;
        END IF;

        -- Ã‚Â¿Estamos dentro del turno de AYER que cruzÃƒÂ³ la medianoche hacia hoy?
        IF NOT v_is_open_now AND v_yesterday_regular IS NOT NULL AND NOT v_yesterday_regular.is_closed THEN
            IF v_yesterday_regular.open_time > v_yesterday_regular.close_time THEN
                -- El turno de ayer terminaba hoy en la madrugada
                IF v_current_time <= v_yesterday_regular.close_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_yesterday_regular.close_time;
                END IF;
            END IF;
        END IF;

        IF v_is_open_now THEN
            v_status_message := 'Abierto ahora | Cierra a las ' || to_char(v_closing_time_today, 'HH12:MI AM');
            RETURN json_build_object('is_open', TRUE, 'message', v_status_message);
        END IF;
    END IF;

    -- =====================================================
    -- FASE 2: ESTÃƒÂ CERRADO. PROYECTAR EL PRÃƒâ€œXIMO DÃƒÂA ABIERTO.
    -- Buscamos hasta 14 dÃƒÂ­as en el futuro para cruzar excepciones y regulares.
    -- =====================================================
    
    FOR i IN 0..14 LOOP
        v_check_date := v_current_date + i;
        v_check_dow := EXTRACT(DOW FROM v_check_date);
        
        -- Buscar excepciÃƒÂ³n para el dÃƒÂ­a proyectado
        SELECT * INTO v_future_exception
        FROM public.business_exceptions
        WHERE v_check_date BETWEEN start_date AND COALESCE(end_date, start_date)
        ORDER BY (COALESCE(end_date, start_date) - start_date) ASC 
        LIMIT 1;

        IF v_future_exception IS NOT NULL THEN
            IF NOT v_future_exception.is_closed THEN
                -- Es un dÃƒÂ­a con horario especial abierto.
                -- Si es hoy (i=0), solo es vÃƒÂ¡lido si la hora de apertura aÃƒÂºn no ha pasado.
                IF i = 0 AND v_current_time >= v_future_exception.close_time THEN
                    CONTINUE; -- Ya cerrÃƒÂ³ por hoy, pasar al siguiente dÃƒÂ­a
                ELSIF i = 0 AND v_current_time < v_future_exception.open_time THEN
                    v_status_message := 'Abrimos hoy a las ' || to_char(v_future_exception.open_time, 'HH12:MI AM') || ' (Horario Especial)';
                    RETURN json_build_object('is_open', FALSE, 'message', v_status_message);
                ELSIF i > 0 THEN
                    -- Es un dÃƒÂ­a futuro
                    v_days_diff := i;
                    v_day_name := CASE v_check_dow WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'MiÃƒÂ©rcoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'SÃƒÂ¡bado' END;
                    v_status_message := 'Abrimos ' || (CASE WHEN v_days_diff = 1 THEN 'maÃƒÂ±ana' WHEN v_days_diff = 2 THEN 'pasado maÃƒÂ±ana' ELSE 'el ' || v_day_name END) || ' a las ' || to_char(v_future_exception.open_time, 'HH12:MI AM');
                    RETURN json_build_object('is_open', FALSE, 'message', v_status_message);
                END IF;
            END IF;
            -- Si future_exception.is_closed es TRUE, el loop simplemente avanza al siguiente dÃƒÂ­a. Ignoramos el business_hours.
        ELSE
            -- No hay excepciÃƒÂ³n para este dÃƒÂ­a proyectado. Consultamos el horario regular.
            SELECT * INTO v_future_regular FROM public.business_hours WHERE day_of_week = v_check_dow;
            
            IF v_future_regular IS NOT NULL AND NOT v_future_regular.is_closed THEN
                IF i = 0 AND v_current_time >= v_future_regular.close_time AND v_future_regular.open_time < v_future_regular.close_time THEN
                    CONTINUE; -- Ya cerrÃƒÂ³ por hoy de forma regular.
                ELSIF i = 0 AND v_current_time < v_future_regular.open_time THEN
                    v_status_message := 'Cerrado ahora | Abrimos hoy a las ' || to_char(v_future_regular.open_time, 'HH12:MI AM');
                    RETURN json_build_object('is_open', FALSE, 'message', v_status_message);
                ELSIF i > 0 THEN
                    v_days_diff := i;
                    v_day_name := CASE v_check_dow WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'MiÃƒÂ©rcoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'SÃƒÂ¡bado' END;
                    v_status_message := 'Cerrado. Abrimos ' || (CASE WHEN v_days_diff = 1 THEN 'maÃƒÂ±ana' WHEN v_days_diff = 2 THEN 'pasado maÃƒÂ±ana' ELSE 'el ' || v_day_name END) || ' a las ' || to_char(v_future_regular.open_time, 'HH12:MI AM');
                    RETURN json_build_object('is_open', FALSE, 'message', v_status_message);
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Si el bucle termina y no encontrÃƒÂ³ apertura en 14 dÃƒÂ­as
    RETURN json_build_object('is_open', FALSE, 'message', 'El negocio estÃƒÂ¡ cerrado temporalmente. Consulta prÃƒÂ³ximos horarios.');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customers_with_referrals()
 RETURNS TABLE(id uuid, customer_name character varying, phone character varying, referral_code character varying, referral_count integer, level_name character varying, referred_customers jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_default_admin_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $$function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_default_staff_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $$function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_detailed_referral_info()
 RETURNS TABLE(customer_id uuid, customer_name character varying, referral_code character varying, referral_count integer, level_name character varying, referred_customers jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_first_purchase_referral_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
DECLARE
  referred_customer_record RECORD;
  completed_order_count INTEGER;
BEGIN
  -- Mensaje para saber que el trigger se ejecutÃƒÂ³
  RAISE NOTICE '[handle_update] Trigger ejecutado. OLD status: %, NEW status: %', OLD.status, NEW.status;

  -- Solo actuar si el NUEVO estado es 'completado' Y el estado ANTERIOR NO era 'completado'
  IF NEW.status = 'completado' AND OLD.status <> 'completado' THEN
    RAISE NOTICE '[handle_update] CondiciÃƒÂ³n de estado (pendiente -> completado) cumplida para cliente ID: %', NEW.customer_id;

    -- Obtener informaciÃƒÂ³n relevante del cliente
    SELECT id, referrer_id, has_made_first_purchase
    INTO referred_customer_record
    FROM public.customers
    WHERE id = NEW.customer_id;

    -- Verificar si encontramos al cliente
    IF NOT FOUND THEN
      RAISE NOTICE '[handle_update] Cliente ID: % no encontrado en tabla customers.', NEW.customer_id;
      RETURN NEW; -- Salir si no se encuentra el cliente
    END IF;

    RAISE NOTICE '[handle_update] Cliente encontrado. has_made_first_purchase: %, referrer_id: %',
                 referred_customer_record.has_made_first_purchase, referred_customer_record.referrer_id;

    -- Verificar si aÃƒÂºn no ha hecho su primera compra
    IF referred_customer_record.has_made_first_purchase = FALSE THEN
      RAISE NOTICE '[handle_update] Cliente (ID: %) aÃƒÂºn no ha hecho su primera compra. Verificando conteo de ÃƒÂ³rdenes...', NEW.customer_id;

      -- Contar cuÃƒÂ¡ntas ÃƒÂ³rdenes COMPLETADAS tiene este cliente AHORA
      -- AsegÃƒÂºrate que la comparaciÃƒÂ³n de status sea exacta ('completado')
      SELECT COUNT(*)
      INTO completed_order_count
      FROM public.orders
      WHERE customer_id = referred_customer_record.id AND status = 'completado';

      RAISE NOTICE '[handle_update] Conteo de ÃƒÂ³rdenes completadas para cliente %: %', referred_customer_record.id, completed_order_count;

      -- Si el conteo es exactamente 1 (esta es la primera completada)
      IF completed_order_count = 1 THEN
          RAISE NOTICE '[handle_update] Ã‚Â¡Es la primera orden completada para el cliente %!', referred_customer_record.id;
          -- Marcar al cliente
          UPDATE public.customers
          SET has_made_first_purchase = TRUE
          WHERE id = referred_customer_record.id;
          RAISE NOTICE '[handle_update] Flag has_made_first_purchase actualizado a TRUE para cliente %', referred_customer_record.id;

          -- Incrementar contador del referente si existe
          IF referred_customer_record.referrer_id IS NOT NULL THEN
              RAISE NOTICE '[handle_update] Llamando a increment_referral_count para referente ID: %', referred_customer_record.referrer_id;
              PERFORM increment_referral_count(referred_customer_record.referrer_id); -- Llamada a la funciÃƒÂ³n de incremento
          ELSE
              RAISE NOTICE '[handle_update] Cliente % no tiene referrer_id.', referred_customer_record.id;
          END IF;
      ELSE
          -- Si count es > 1, significa que ya tenÃƒÂ­a ÃƒÂ³rdenes completadas antes (quizÃƒÂ¡s de pruebas)
          -- O si count es 0 (algo raro pasÃƒÂ³), no hacemos nada.
          -- Marcaremos igualmente que ya hizo una compra para evitar problemas futuros.
          IF completed_order_count > 1 THEN
             RAISE NOTICE '[handle_update] No es la primera orden completada (conteo: %). Actualizando flag pero no incrementando contador.', completed_order_count;
             UPDATE public.customers
             SET has_made_first_purchase = TRUE
             WHERE id = referred_customer_record.id;
          ELSE
             RAISE NOTICE '[handle_update] Conteo de ÃƒÂ³rdenes completadas inesperado (%). No se hace nada.', completed_order_count;
          END IF;

      END IF; -- Fin check primera orden (count = 1)
    ELSE
        RAISE NOTICE '[handle_update] Cliente % ya habÃƒÂ­a hecho su primera compra (flag era TRUE).', referred_customer_record.id;
    END IF; -- Fin check has_made_first_purchase = FALSE
  END IF; -- Fin check status cambiÃƒÂ³ a 'completado'

  RETURN NEW; -- Necesario para triggers AFTER UPDATE
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
begin
  -- Inserta una nueva fila en tu tabla 'admins'
  insert into public.admins (id, name, email)
  -- 'new' se refiere al nuevo registro que activÃƒÂ³ el trigger (el nuevo usuario)
  values (new.id, new.raw_user_meta_data->>'name', new.email);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_referral_count(p_referrer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
BEGIN
  RAISE NOTICE '[increment_referral_count] Intentando incrementar contador para ID: %', p_referrer_id;
  UPDATE public.customers
  SET referral_count = referral_count + 1
  WHERE id = p_referrer_id;

  IF FOUND THEN
    RAISE NOTICE '[increment_referral_count] Contador incrementado exitosamente para ID: %', p_referrer_id;
  ELSE
    RAISE NOTICE '[increment_referral_count] ADVERTENCIA: No se encontrÃƒÂ³ cliente con ID % para incrementar contador.', p_referrer_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
BEGIN
    -- CORRECCIÃƒâ€œN: Remover CONCURRENTLY porque la vista tiene solo 1 fila
    REFRESH MATERIALIZED VIEW dashboard_stats;
    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.return_stock_on_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
DECLARE
    item RECORD;
    recipe_ingredient RECORD;
BEGIN
    -- 1. Comprobar la condiciÃƒÂ³n que pediste:
    -- Ã‚Â¿El nuevo estado es 'cancelado' Y el estado antiguo era 'pendiente'?
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
$function$
;

CREATE OR REPLACE FUNCTION public.send_order_notification_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
BEGIN
  PERFORM
    -- Ã°Å¸â€˜â€¡ CORRECCIÃƒâ€œN: Usar net.http_post
    net.http_post(
      url:='https://xvstqhvooabljhhfmuas.functions.supabase.co/send-order-notification', -- Especificar nombre del parÃƒÂ¡metro
      body:=jsonb_build_object( -- Especificar nombre del parÃƒÂ¡metro
        'record', to_jsonb(NEW),
        'old_record', to_jsonb(OLD)
      ),
      headers:='{"Content-Type": "application/json"}'::jsonb -- Especificar nombre y tipo del parÃƒÂ¡metro
    );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_ingredient_stock_on_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$function$
DECLARE
    purchase_unit_factor NUMERIC;
    total_base_units NUMERIC;
    cost_per_unit NUMERIC;
    current_avg_cost NUMERIC;
    current_total_stock NUMERIC;
    new_avg_cost NUMERIC;
    new_total_stock NUMERIC;
BEGIN
    -- 1. Obtener el factor de conversiÃƒÂ³n (ej: "Garrafa" -> 3500)
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
        new_avg_cost := 0; -- Evitar divisiÃƒÂ³n por cero si el stock es 0
    END IF;

    -- 6. Actualizar la tabla 'ingredients' (el cerebro)
    UPDATE public.ingredients
    SET 
        current_stock = new_total_stock,
        average_cost = new_avg_cost
    WHERE id = NEW.ingredient_id;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_discount_target()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$function$
BEGIN
    IF NEW.type = 'global' AND NEW.target_id IS NOT NULL THEN
        RAISE EXCEPTION 'Los descuentos globales no pueden tener target_id';
    END IF;
    IF NEW.type = 'category' AND NEW.target_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.target_id) THEN
            RAISE EXCEPTION 'target_id debe corresponder a una categorÃƒÂ­a vÃƒÂ¡lida';
        END IF;
    END IF;
    IF NEW.type = 'product' AND NEW.target_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM products WHERE id = NEW.target_id) THEN
            RAISE EXCEPTION 'target_id debe corresponder a un producto vÃƒÂ¡lido';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

-- =====================
-- CUTOFF TRIGGERS
-- =====================
CREATE TRIGGER trigger_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_generate_order_code BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION generate_order_code();

CREATE TRIGGER trigger_validate_discount_target BEFORE INSERT OR UPDATE ON public.discounts FOR EACH ROW EXECUTE FUNCTION validate_discount_target();

CREATE TRIGGER refresh_stats_trigger AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH STATEMENT EXECUTE FUNCTION refresh_dashboard_stats();

CREATE TRIGGER on_order_status_change AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION send_order_notification_on_status_change();

CREATE TRIGGER on_ingredient_purchase_inserted AFTER INSERT ON public.ingredient_purchases FOR EACH ROW EXECUTE FUNCTION update_ingredient_stock_on_purchase();

CREATE TRIGGER handle_stock_return_on_cancel AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION return_stock_on_cancellation();




CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_product_stats_single(p_product_id uuid)
 RETURNS TABLE(product_id uuid, total_sold bigint, total_revenue numeric, avg_rating numeric, reviews_count bigint, favorites_count bigint)
 LANGUAGE plpgsql
AS $$$
BEGIN
  RETURN QUERY
  SELECT
    p_product_id as product_id,
    
    (SELECT COALESCE(SUM(oi.quantity), 0)::BIGINT
     FROM order_items oi
     INNER JOIN orders o ON oi.order_id = o.id
     WHERE oi.product_id = p_product_id AND o.status = 'completado'
    ) as total_sold,
    
    (SELECT COALESCE(SUM(oi.quantity * oi.price), 0)
     FROM order_items oi
     INNER JOIN orders o ON oi.order_id = o.id
     WHERE oi.product_id = p_product_id AND o.status = 'completado'
    ) as total_revenue,
    
    (SELECT AVG(pr.rating) FROM product_reviews pr WHERE pr.product_id = p_product_id) as avg_rating,
    (SELECT COUNT(*)::BIGINT FROM product_reviews pr WHERE pr.product_id = p_product_id) as reviews_count,
    (SELECT COUNT(*)::BIGINT FROM customer_favorites cf WHERE cf.product_id = p_product_id) as favorites_count;
END;
$$$;

CREATE OR REPLACE FUNCTION public.handle_first_purchase_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$$
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
$$$;

CREATE OR REPLACE FUNCTION public.record_discount_usage_and_deactivate(p_customer_id uuid, p_discount_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$$
DECLARE
    discount_info record;
BEGIN
    SELECT is_single_use, specific_customer_id, requires_referred_status
    INTO discount_info
    FROM public.discounts
    WHERE id = p_discount_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    INSERT INTO public.customer_discount_usage (customer_id, discount_id)
    VALUES (p_customer_id, p_discount_id)
    ON CONFLICT DO NOTHING;

    IF discount_info.is_single_use AND discount_info.specific_customer_id IS NOT NULL THEN
        UPDATE public.discounts
        SET is_active = FALSE
        WHERE id = p_discount_id;
    END IF;
END;
$$$;

CREATE OR REPLACE FUNCTION public.get_customer_basic_stats(p_customer_id uuid)
 RETURNS TABLE(total_orders bigint, completed_orders bigint, total_spent numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$$
BEGIN
 return query 
 select 
  (select count(*)::bigint from public.orders o where o.customer_id = p_customer_id),
  (select count(*)::bigint from public.orders o where o.customer_id = p_customer_id and o.status = 'completado'),
  (select coalesce(sum(o.total_amount), 0) from public.orders o where o.customer_id = p_customer_id and o.status = 'completado');
END;
$$$;

CREATE OR REPLACE FUNCTION public.get_customer_rewards_progress(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$$
DECLARE
    referral_c integer;
    current_l record;
    next_l record;
    unlocked_r jsonb;
    upcoming_r jsonb;
    claimed_r jsonb;
BEGIN
    SELECT COALESCE(referral_count, 0) INTO referral_c FROM public.customers WHERE id = p_customer_id;
    SELECT * INTO current_l FROM public.referral_levels WHERE min_referrals <= referral_c ORDER BY min_referrals DESC LIMIT 1;
    SELECT * INTO next_l FROM public.referral_levels WHERE min_referrals > referral_c ORDER BY min_referrals ASC LIMIT 1;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'level_id', r.level_id,
            'level_name', l.name,
            'min_referrals', l.min_referrals,
            'description', r.description,
            'reward_code', r.reward_code,
            'type', r.type
        ) ORDER BY l.min_referrals ASC, r.created_at ASC
    ) INTO unlocked_r
    FROM public.rewards r
    JOIN public.referral_levels l ON r.level_id = l.id
    WHERE l.min_referrals <= referral_c;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'level_id', r.level_id,
            'level_name', next_l.name,
            'min_referrals', next_l.min_referrals,
            'description', r.description,
            'reward_code', r.reward_code,
            'type', r.type
        ) ORDER BY r.created_at ASC
    ) INTO upcoming_r
    FROM public.rewards r
    WHERE next_l.id IS NOT NULL AND r.level_id = next_l.id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'reward_id', crc.reward_id,
            'level_id', r.level_id,
            'generated_code', crc.generated_code,
            'claimed_at', crc.claimed_at
        )
    )
    INTO claimed_r
    FROM public.customer_reward_claims crc
    JOIN public.rewards r ON r.id = crc.reward_id
    WHERE crc.customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'referral_count', referral_c,
        'current_level', to_jsonb(current_l),
        'next_level', to_jsonb(next_l),
        'unlocked_rewards', COALESCE(unlocked_r, '[]'::jsonb),
        'upcoming_rewards', COALESCE(upcoming_r, '[]'::jsonb),
        'claimed_rewards', COALESCE(claimed_r, '[]'::jsonb)
    );
END;
$$$;

CREATE OR REPLACE FUNCTION public.generate_personal_reward_code(p_customer_id uuid, p_reward_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$$
DECLARE
    reward_info record;
    original_discount record;
    new_code text;
    base_code text;
    customer_name_part text;
    v_referral_count integer;
BEGIN
    IF EXISTS (SELECT 1 FROM public.customer_reward_claims WHERE customer_id = p_customer_id AND reward_id = p_reward_id) THEN
        RAISE EXCEPTION 'El cliente ya ha reclamado esta recompensa.';
    END IF;

    SELECT r.description, r.reward_code, r.level_id, l.min_referrals
    INTO reward_info
    FROM public.rewards r
    JOIN public.referral_levels l ON r.level_id = l.id
    WHERE r.id = p_reward_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La recompensa especificada no fue encontrada.';
    END IF;

    IF EXISTS (
        SELECT 1 
        FROM public.customer_reward_claims crc
        JOIN public.rewards r ON r.id = crc.reward_id
        WHERE crc.customer_id = p_customer_id 
          AND r.level_id = reward_info.level_id
    ) THEN
        RAISE EXCEPTION 'Ya has elegido una recompensa para este nivel. Solo se permite una por nivel.';
    END IF;

    SELECT COALESCE(referral_count, 0), SUBSTRING(UPPER(COALESCE(name, 'CLIE')) FROM 1 FOR 4)
    INTO v_referral_count, customer_name_part
    FROM public.customers
    WHERE id = p_customer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente no encontrado.';
    END IF;

    IF v_referral_count < reward_info.min_referrals THEN
        RAISE EXCEPTION 'Referidos insuficientes (% de % requeridos) para reclamar esta recompensa.',
            v_referral_count, reward_info.min_referrals;
    END IF;

    SELECT type, value, target_id INTO original_discount
    FROM public.discounts
    WHERE code = reward_info.reward_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El código de descuento base "%" no fue encontrado.', reward_info.reward_code;
    END IF;

    base_code := 'EA-' || customer_name_part || '-' || reward_info.reward_code;
    new_code := base_code;

    WHILE EXISTS (SELECT 1 FROM public.discounts WHERE code = new_code) LOOP
        new_code := base_code || '-' || LPAD( (RANDOM() * 100)::int::text, 2, '0');
    END LOOP;

    INSERT INTO public.discounts (code, type, value, target_id, is_active, is_single_use, specific_customer_id)
    VALUES (new_code, original_discount.type, original_discount.value, original_discount.target_id, true, true, p_customer_id);

    INSERT INTO public.customer_reward_claims (customer_id, reward_id, generated_code)
    VALUES (p_customer_id, p_reward_id, new_code);

    RETURN new_code;
END;
$$$;

CREATE TRIGGER trigger_first_purchase_referral
 AFTER INSERT OR UPDATE OF status ON public.orders
 FOR EACH ROW
 WHEN ((new.status = 'completado'::order_status))
 EXECUTE FUNCTION public.handle_first_purchase_referral();
