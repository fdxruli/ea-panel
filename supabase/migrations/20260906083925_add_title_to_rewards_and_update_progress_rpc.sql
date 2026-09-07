-- 1. Agregar columna title a la tabla rewards
ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS title character varying;

-- 2. Poblar title en recompensas existentes si está vacío
UPDATE public.rewards
SET title = description
WHERE title IS NULL OR title = '';

-- 3. Actualizar función RPC get_customer_rewards_progress para incluir title
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

    -- Recompensas desbloqueadas con título, descripción y metadatos del nivel
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'level_id', r.level_id,
            'level_name', l.name,
            'min_referrals', l.min_referrals,
            'title', COALESCE(r.title, r.description),
            'description', r.description,
            'reward_code', r.reward_code,
            'type', r.type
        ) ORDER BY l.min_referrals ASC, r.created_at ASC
    ) INTO unlocked_r
    FROM public.rewards r
    JOIN public.referral_levels l ON r.level_id = l.id
    WHERE l.min_referrals <= referral_c;

    -- Recompensas del próximo nivel con título y descripción
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'level_id', r.level_id,
            'level_name', next_l.name,
            'min_referrals', next_l.min_referrals,
            'title', COALESCE(r.title, r.description),
            'description', r.description,
            'reward_code', r.reward_code,
            'type', r.type
        ) ORDER BY r.created_at ASC
    ) INTO upcoming_r
    FROM public.rewards r
    WHERE next_l.id IS NOT NULL AND r.level_id = next_l.id;

    -- Recompensas reclamadas por el cliente incluyendo el level_id y título
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
