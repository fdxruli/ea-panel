-- ============================================================================
-- Migration: 20260927000000_customer_loyalty_tier_support.sql
-- Description:
--   1. Añade columna loyalty_tier en public.customers para asignación o promoción manual de nivel.
--   2. Actualiza get_customer_loyalty_tier(uuid) para respetar loyalty_tier prioritariamente.
--   3. Actualiza get_my_loyalty_category(uuid DEFAULT NULL) para clientes autenticados por teléfono.
--   4. Actualiza verify_customer_by_phone(text) para incluir loyalty_tier en el objeto devuelto.
--   5. Asigna nivel 'vip' al cliente Ruly (teléfono 9633870587).
-- ============================================================================

-- 1. Añadir columna loyalty_tier a customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_tier text DEFAULT NULL;

-- 2. get_customer_loyalty_tier(uuid)
CREATE OR REPLACE FUNCTION public.get_customer_loyalty_tier(p_customer_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_manual_tier text;
  v_total_spent numeric := 0;
  v_completed_orders bigint := 0;
  v_last_order_date timestamptz;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN 'inicial';
  END IF;

  -- 1. Si el cliente tiene un nivel asignado o promovido manualmente en customers
  SELECT loyalty_tier INTO v_manual_tier
  FROM public.customers
  WHERE id = p_customer_id;

  IF v_manual_tier IS NOT NULL AND btrim(v_manual_tier) != '' THEN
    RETURN lower(btrim(v_manual_tier));
  END IF;

  -- 2. Cálculo dinámico basado en historial de compras de los últimos 90 días
  SELECT
    COALESCE(SUM(o.total_amount), 0),
    COUNT(o.id),
    MAX(o.created_at)
  INTO
    v_total_spent,
    v_completed_orders,
    v_last_order_date
  FROM public.orders o
  WHERE o.customer_id = p_customer_id
    AND o.status = 'completado'::public.order_status;

  IF (v_total_spent >= 3000 OR v_completed_orders >= 15)
     AND v_last_order_date >= NOW() - INTERVAL '90 days' THEN
    RETURN 'vip';
  ELSIF (v_total_spent >= 750 OR v_completed_orders >= 3)
     AND v_last_order_date >= NOW() - INTERVAL '90 days' THEN
    RETURN 'frecuente';
  ELSE
    RETURN 'inicial';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_loyalty_tier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_tier(uuid) TO anon, authenticated, service_role;

-- 3. get_my_loyalty_category(uuid)
DROP FUNCTION IF EXISTS public.get_my_loyalty_category();
DROP FUNCTION IF EXISTS public.get_my_loyalty_category(uuid);

CREATE OR REPLACE FUNCTION public.get_my_loyalty_category(p_customer_id uuid DEFAULT NULL)
RETURNS TABLE(category text, benefit_label text, condition_label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id uuid;
  v_tier text;
BEGIN
  IF p_customer_id IS NOT NULL THEN
    v_target_id := p_customer_id;
  ELSIF (SELECT auth.uid()) IS NOT NULL THEN
    SELECT id INTO v_target_id FROM public.customers WHERE auth_user_id = (SELECT auth.uid()) LIMIT 1;
  END IF;

  IF v_target_id IS NULL THEN
    RETURN QUERY SELECT 
      'inicial'::text AS category,
      'Comienza a disfrutar de nuestras promociones.'::text AS benefit_label,
      'Nivel Inicial.'::text AS condition_label;
    RETURN;
  END IF;

  v_tier := public.get_customer_loyalty_tier(v_target_id);

  RETURN QUERY SELECT
    v_tier AS category,
    CASE v_tier
      WHEN 'vip' THEN 'Accedes a beneficios y cortesías exclusivas.'::text
      WHEN 'frecuente' THEN 'Obtienes promociones especiales por tu recurrencia.'::text
      ELSE 'Comienza a disfrutar de nuestras promociones.'::text
    END AS benefit_label,
    CASE v_tier
      WHEN 'vip' THEN 'Nivel VIP activo.'::text
      WHEN 'frecuente' THEN 'Nivel Frecuente activo.'::text
      ELSE 'Nivel Inicial.'::text
    END AS condition_label;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_loyalty_category(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty_category(uuid) TO anon, authenticated, service_role;

-- 4. verify_customer_by_phone(text)
CREATE OR REPLACE FUNCTION public.verify_customer_by_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer record;
  v_active_terms_id uuid;
  v_has_accepted boolean := false;
  v_clean_phone text;
  v_base_code text;
  v_code text;
  v_counter integer := 1;
  v_loyalty_tier text;
BEGIN
  v_clean_phone := btrim(coalesce(p_phone, ''));
  IF length(v_clean_phone) < 10 THEN
    RETURN jsonb_build_object('found', false, 'code', 'invalid_phone');
  END IF;

  SELECT * INTO v_customer
  FROM public.customers c
  WHERE c.phone = v_clean_phone
     OR (length(v_clean_phone) = 10 AND c.phone = '+52' || v_clean_phone)
     OR (length(v_clean_phone) = 12 AND c.phone = '+' || v_clean_phone)
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Si el cliente existente no tiene referral_code, generarlo automáticamente
  IF v_customer.referral_code IS NULL THEN
    v_base_code := 'EA-' || upper(substr(regexp_replace(coalesce(v_customer.name, 'CL'), '[^[:alnum:]]', '', 'g'), 1, 2)) || right(regexp_replace(v_customer.phone, '[^0-9]', '', 'g'), 2);
    IF length(v_base_code) < 6 THEN
      v_base_code := 'EA-CL' || right(regexp_replace(v_customer.phone, '[^0-9]', '', 'g'), 2);
    END IF;
    v_code := v_base_code;
    WHILE EXISTS (SELECT 1 FROM public.customers WHERE referral_code = v_code) LOOP
      v_counter := v_counter + 1;
      v_code := v_base_code || '-' || v_counter;
    END LOOP;
    UPDATE public.customers SET referral_code = v_code WHERE id = v_customer.id;
    v_customer.referral_code := v_code;
  END IF;

  SELECT id INTO v_active_terms_id
  FROM public.terms_and_conditions
  ORDER BY version DESC
  LIMIT 1;

  IF v_active_terms_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.customer_terms_acceptances cta
      WHERE cta.customer_id = v_customer.id
        AND cta.terms_version_id = v_active_terms_id
    ) INTO v_has_accepted;
  END IF;

  v_loyalty_tier := public.get_customer_loyalty_tier(v_customer.id);

  RETURN jsonb_build_object(
    'found', true,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'name', v_customer.name,
      'phone', v_customer.phone,
      'referral_code', v_customer.referral_code,
      'referrer_id', v_customer.referrer_id,
      'referral_count', v_customer.referral_count,
      'has_made_first_purchase', v_customer.has_made_first_purchase,
      'birthdate', v_customer.birthdate,
      'created_at', v_customer.created_at,
      'terms_accepted', v_has_accepted,
      'loyalty_tier', v_loyalty_tier
    )
  );
END;
$$;

-- 5. Promover al cliente Ruly a VIP
UPDATE public.customers
SET loyalty_tier = 'vip'
WHERE phone LIKE '%9633870587%' OR phone = '+529633870587';
