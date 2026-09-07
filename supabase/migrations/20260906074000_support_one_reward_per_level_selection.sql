-- =======================================================
-- MIGRACIÓN: Soporte para selección exclusiva de 1 recompensa por nivel
-- =======================================================

-- 1. Actualizar get_customer_rewards_progress
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

    -- Recompensas desbloqueadas con datos de su nivel
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

    -- Recompensas del próximo nivel
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

    -- Recompensas reclamadas por el cliente incluyendo el level_id
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
$function$;

-- 2. Actualizar generate_personal_reward_code con validación de 1 recompensa por nivel
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
    -- 1. Validar si ya reclamó esta recompensa específica
    IF EXISTS (SELECT 1 FROM public.customer_reward_claims WHERE customer_id = p_customer_id AND reward_id = p_reward_id) THEN
        RAISE EXCEPTION 'El cliente ya ha reclamado esta recompensa.';
    END IF;

    -- 2. Obtener información de la recompensa y su nivel
    SELECT r.description, r.reward_code, r.level_id, l.min_referrals
    INTO reward_info
    FROM public.rewards r
    JOIN public.referral_levels l ON r.level_id = l.id
    WHERE r.id = p_reward_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La recompensa especificada no fue encontrada.';
    END IF;

    -- 3. REGLA CLAVE: Validar si el cliente ya reclamó OTRA recompensa del MISMO nivel
    IF EXISTS (
        SELECT 1 
        FROM public.customer_reward_claims crc
        JOIN public.rewards r ON r.id = crc.reward_id
        WHERE crc.customer_id = p_customer_id 
          AND r.level_id = reward_info.level_id
    ) THEN
        RAISE EXCEPTION 'Ya has elegido una recompensa para este nivel. Solo se permite una por nivel.';
    END IF;

    -- 4. Validar cantidad de referidos
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

    -- 5. Obtener descuento base
    SELECT type, value, target_id INTO original_discount
    FROM public.discounts
    WHERE code = reward_info.reward_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El código de descuento base "%" no fue encontrado.', reward_info.reward_code;
    END IF;

    -- 6. Generar código personal único
    base_code := 'EA-' || customer_name_part || '-' || reward_info.reward_code;
    new_code := base_code;

    WHILE EXISTS (SELECT 1 FROM public.discounts WHERE code = new_code) LOOP
        new_code := base_code || '-' || LPAD( (RANDOM() * 100)::int::text, 2, '0');
    END LOOP;

    -- 7. Insertar descuento de uso único personalizado
    INSERT INTO public.discounts (code, type, value, target_id, is_active, is_single_use, specific_customer_id)
    VALUES (new_code, original_discount.type, original_discount.value, original_discount.target_id, true, true, p_customer_id);

    -- 8. Registrar el reclamo
    INSERT INTO public.customer_reward_claims (customer_id, reward_id, generated_code)
    VALUES (p_customer_id, p_reward_id, new_code);

    RETURN new_code;
END;
$function$;
