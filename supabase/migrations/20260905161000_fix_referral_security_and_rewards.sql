-- =======================================================
-- MIGRACIÓN: Corrección de seguridad y lógica del módulo de referidos
-- =======================================================

-- 1. Restringir update_customer_referral_count solo a admins
CREATE OR REPLACE FUNCTION public.update_customer_referral_count(p_customer_id uuid, p_new_count integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden modificar el contador de referidos.';
  END IF;

  IF p_new_count < 0 THEN
    RAISE EXCEPTION 'El contador de referidos no puede ser negativo.';
  END IF;

  UPDATE public.customers
  SET referral_count = p_new_count
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE WARNING 'No se encontró ningún cliente con el ID % para actualizar el contador.', p_customer_id;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_customer_referral_count(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_customer_referral_count(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_customer_referral_count(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_referral_count(uuid, integer) TO service_role;

-- 2. Validar nivel y referidos en generate_personal_reward_code
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
    IF EXISTS (SELECT 1 FROM public.customer_reward_claims WHERE customer_id = p_customer_id AND reward_id = p_reward_id) THEN
        RAISE EXCEPTION 'El cliente ya ha reclamado esta recompensa.';
    END IF;

    SELECT r.description, r.reward_code, l.min_referrals
    INTO reward_info
    FROM public.rewards r
    JOIN public.referral_levels l ON r.level_id = l.id
    WHERE r.id = p_reward_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La recompensa especificada no fue encontrada.';
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
$function$;

-- 3. Trigger atómico para primera compra (INSERT y UPDATE)
CREATE OR REPLACE FUNCTION public.handle_first_purchase_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

DROP TRIGGER IF EXISTS trigger_first_purchase_referral_update ON public.orders;
DROP TRIGGER IF EXISTS trigger_first_purchase_referral ON public.orders;

CREATE TRIGGER trigger_first_purchase_referral
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (new.status = 'completado'::order_status)
EXECUTE FUNCTION public.handle_first_purchase_referral();

-- 4. Activar descuento de bienvenida
UPDATE public.discounts
SET is_active = true
WHERE code = 'AMIGONUEVO';
