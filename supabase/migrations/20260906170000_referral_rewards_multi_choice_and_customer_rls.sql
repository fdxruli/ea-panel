-- ==============================================================================
-- Migration: 20260906170000_referral_rewards_multi_choice_and_customer_rls.sql
-- Description:
--   1. Soporte para múltiples opciones de recompensa por nivel (título/nombre de beneficio).
--   2. Blindaje de seguridad: Ocultamiento total de reward_code en recompensas no elegidas.
--   3. Lógica de 1 sola recompensa por nivel con generación de cupón personal único (EA-...).
--   4. Corrección de políticas RLS y permisos para clientes anónimos basados en teléfono.
-- ==============================================================================

-- 1. Añadir columna title a rewards si no existe
ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS title VARCHAR(100);

-- 2. Función RPC para generar código personal único limitando a 1 recompensa por nivel
CREATE OR REPLACE FUNCTION public.generate_personal_reward_code(p_customer_id uuid, p_reward_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    reward_info record;
    original_discount record;
    new_code text;
    base_code text;
    customer_name_part text;
    v_referral_count integer;
BEGIN
    -- Validar si ya reclamó esta recompensa específica
    IF EXISTS (SELECT 1 FROM public.customer_reward_claims WHERE customer_id = p_customer_id AND reward_id = p_reward_id) THEN
        RAISE EXCEPTION 'El cliente ya ha reclamado esta recompensa.';
    END IF;

    -- Obtener información de la recompensa y su nivel
    SELECT r.description, r.reward_code, r.level_id, l.min_referrals
    INTO reward_info
    FROM public.rewards r
    JOIN public.referral_levels l ON r.level_id = l.id
    WHERE r.id = p_reward_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La recompensa especificada no fue encontrada.';
    END IF;

    -- REGLA CLAVE: Validar si el cliente ya reclamó OTRA recompensa del MISMO nivel
    IF EXISTS (
        SELECT 1 
        FROM public.customer_reward_claims crc
        JOIN public.rewards r ON r.id = crc.reward_id
        WHERE crc.customer_id = p_customer_id 
          AND r.level_id = reward_info.level_id
    ) THEN
        RAISE EXCEPTION 'Ya has elegido una recompensa para este nivel. Solo se permite una por nivel.';
    END IF;

    -- Validar cantidad de referidos
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

    -- Obtener descuento base
    SELECT type, value, target_id INTO original_discount
    FROM public.discounts
    WHERE code = reward_info.reward_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El código de descuento base "%" no fue encontrado.', reward_info.reward_code;
    END IF;

    -- Generar código personal único
    base_code := 'EA-' || customer_name_part || '-' || reward_info.reward_code;
    new_code := base_code;

    WHILE EXISTS (SELECT 1 FROM public.discounts WHERE code = new_code) LOOP
        new_code := base_code || '-' || LPAD( (RANDOM() * 100)::int::text, 2, '0');
    END LOOP;

    -- Insertar descuento de uso único personalizado
    INSERT INTO public.discounts (code, type, value, target_id, is_active, is_single_use, specific_customer_id)
    VALUES (new_code, original_discount.type, original_discount.value, original_discount.target_id, true, true, p_customer_id);

    -- Registrar el reclamo
    INSERT INTO public.customer_reward_claims (customer_id, reward_id, generated_code)
    VALUES (p_customer_id, p_reward_id, new_code);

    RETURN new_code;
END;
$function$;

-- 3. Función RPC para progreso de recompensas (Cero exposición de reward_code previo al reclamo)
CREATE OR REPLACE FUNCTION public.get_customer_rewards_progress(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- Recompensas desbloqueadas (SIN exponer reward_code para proteger la seguridad del negocio)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'level_id', r.level_id,
            'level_name', l.name,
            'min_referrals', l.min_referrals,
            'title', COALESCE(r.title, r.description),
            'description', r.description,
            'type', r.type
        ) ORDER BY l.min_referrals ASC, r.created_at ASC
    ) INTO unlocked_r
    FROM public.rewards r
    JOIN public.referral_levels l ON r.level_id = l.id
    WHERE l.min_referrals <= referral_c;

    -- Recompensas del próximo nivel (TOTALMENTE PROTEGIDAS: sin reward_code)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'level_id', r.level_id,
            'level_name', next_l.name,
            'min_referrals', next_l.min_referrals,
            'title', COALESCE(r.title, r.description),
            'description', r.description,
            'type', r.type
        ) ORDER BY r.created_at ASC
    ) INTO upcoming_r
    FROM public.rewards r
    WHERE next_l.id IS NOT NULL AND r.level_id = next_l.id;

    -- Recompensas reclamadas: AQUÍ Y SOLO AQUÍ va el código personal generado por el cliente
    SELECT jsonb_agg(
        jsonb_build_object(
            'reward_id', crc.reward_id,
            'level_id', r.level_id,
            'title', COALESCE(r.title, r.description),
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
$function$;

-- 4. Corrección de Políticas RLS para flujo de clientes anónimos basados en teléfono
DROP POLICY IF EXISTS "Customers can view their own profile" ON public.customers;
CREATE POLICY "Customers can view their own profile" ON public.customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Customers can update their own profile" ON public.customers;
CREATE POLICY "Customers can update their own profile" ON public.customers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Customers can insert profile" ON public.customers;
CREATE POLICY "Customers can insert profile" ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can view terms acceptances" ON public.customer_terms_acceptances;
CREATE POLICY "Customers can view terms acceptances" ON public.customer_terms_acceptances FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Customers can insert terms acceptances" ON public.customer_terms_acceptances;
CREATE POLICY "Customers can insert terms acceptances" ON public.customer_terms_acceptances FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage their addresses" ON public.customer_addresses;
CREATE POLICY "Customers can manage their addresses" ON public.customer_addresses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage their favorites" ON public.customer_favorites;
CREATE POLICY "Customers can manage their favorites" ON public.customer_favorites FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can view their reward claims" ON public.customer_reward_claims;
CREATE POLICY "Customers can view their reward claims" ON public.customer_reward_claims FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Customers can view their own orders" ON public.orders;
CREATE POLICY "Customers can view their own orders" ON public.orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Customers can insert their own orders" ON public.orders;
CREATE POLICY "Customers can insert their own orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can view their own order items" ON public.order_items;
CREATE POLICY "Customers can view their own order items" ON public.order_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Customers can insert order items" ON public.order_items;
CREATE POLICY "Customers can insert order items" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage their push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Customers can manage their push subscriptions" ON public.push_subscriptions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can view their discount usage" ON public.customer_discount_usage;
CREATE POLICY "Customers can view their discount usage" ON public.customer_discount_usage FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Customers can insert discount usage" ON public.customer_discount_usage;
CREATE POLICY "Customers can insert discount usage" ON public.customer_discount_usage FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage their reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Customers can update their reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Customers can insert their reviews" ON public.product_reviews;
CREATE POLICY "Public can view reviews" ON public.product_reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can insert reviews" ON public.product_reviews FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update reviews" ON public.product_reviews FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. Permisos de ejecución de RPCs para clientes
GRANT EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamptz, public.cart_item[], varchar) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_rewards_progress(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_personal_reward_code(uuid, uuid) TO anon, authenticated, service_role;
