-- ============================================================================
-- Migration: 20260916010000_phase_6_customer_profile_and_addresses_rpc.sql
-- Module: Atomic Customer Addresses, Profile Update and Non-Monetary Loyalty RPC
-- Description:
--   1. Non-destructively normalizes legacy duplicate default addresses.
--   2. Adds partial unique index for exactly one default address per customer.
--   3. Adds atomic RPC set_my_default_customer_address(p_address_id uuid).
--   4. Adds secure RPC update_my_customer_profile(p_name text).
--   5. Updates get_my_loyalty_category() to return non-monetary labels without total_spent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NON-DESTRUCTIVE DEFAULT ADDRESS NORMALIZATION
-- ----------------------------------------------------------------------------
-- Keep the most recent default address per customer; set older duplicates to false.
WITH ranked_defaults AS (
  SELECT id, customer_id,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.customer_addresses
  WHERE is_default = true
)
UPDATE public.customer_addresses ca
SET is_default = false
FROM ranked_defaults rd
WHERE ca.id = rd.id AND rd.rn > 1;

-- ----------------------------------------------------------------------------
-- 2. PARTIAL UNIQUE INDEX (ONE DEFAULT PER CUSTOMER)
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_single_default_idx
ON public.customer_addresses (customer_id)
WHERE is_default = true;

-- ----------------------------------------------------------------------------
-- 3. ATOMIC RPC: set_my_default_customer_address
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_default_customer_address(p_address_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_customer_id uuid;
  v_address_exists boolean;
BEGIN
  v_customer_id := public.require_my_customer_id();

  -- Verify ownership of the target address
  SELECT EXISTS (
    SELECT 1 FROM public.customer_addresses
    WHERE id = p_address_id AND customer_id = v_customer_id
  ) INTO v_address_exists;

  IF NOT v_address_exists THEN
    RAISE EXCEPTION 'address_not_found_or_forbidden' USING errcode = 'P0001';
  END IF;

  -- Atomic switch within a single transaction
  UPDATE public.customer_addresses
  SET is_default = false
  WHERE customer_id = v_customer_id AND is_default = true;

  UPDATE public.customer_addresses
  SET is_default = true
  WHERE id = p_address_id AND customer_id = v_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_default_customer_address(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_default_customer_address(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_default_customer_address(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. SECURE RPC: update_my_customer_profile
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_customer_profile(p_name text)
RETURNS TABLE(id uuid, name character varying, phone character varying, referral_code character varying)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_customer_id uuid;
  v_clean_name text;
BEGIN
  v_customer_id := public.require_my_customer_id();
  v_clean_name := btrim(coalesce(p_name, ''));

  IF length(v_clean_name) < 2 OR length(v_clean_name) > 100 THEN
    RAISE EXCEPTION 'invalid_name_length' USING errcode = 'P0001';
  END IF;

  RETURN QUERY
  UPDATE public.customers c
  SET name = v_clean_name
  WHERE c.id = v_customer_id
  RETURNING c.id, c.name, c.phone, c.referral_code;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_customer_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_customer_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_customer_profile(text) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. NON-MONETARY LOYALTY RPC: get_my_loyalty_category
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_loyalty_category();

CREATE OR REPLACE FUNCTION public.get_my_loyalty_category()
RETURNS TABLE(category text, benefit_label text, condition_label text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH my_customer AS (
    SELECT c.id
    FROM public.customers c
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND c.auth_user_id = (SELECT auth.uid())
    LIMIT 1
  ),
  stats AS (
    SELECT
      coalesce(sum(o.total_amount), 0) AS total_spent,
      count(o.id) AS completed_orders,
      max(o.created_at) AS last_order_date
    FROM my_customer mc
    LEFT JOIN public.orders o
      ON o.customer_id = mc.id
     AND o.status = 'completado'::public.order_status
  ),
  calc AS (
    SELECT
      CASE
        WHEN (s.total_spent >= 3000 OR s.completed_orders >= 15)
         AND s.last_order_date >= now() - interval '90 days'
          THEN 'vip'
        WHEN (s.total_spent >= 750 OR s.completed_orders >= 3)
         AND s.last_order_date >= now() - interval '90 days'
          THEN 'frecuente'
        ELSE 'inicial'
      END AS cat
    FROM stats s
    WHERE EXISTS (SELECT 1 FROM my_customer)
  )
  SELECT
    c.cat AS category,
    CASE c.cat
      WHEN 'vip' THEN 'Accedes a beneficios y cortesías exclusivas.'
      WHEN 'frecuente' THEN 'Obtienes promociones especiales por tu recurrencia.'
      ELSE 'Comienza a disfrutar de nuestras promociones.'
    END AS benefit_label,
    CASE c.cat
      WHEN 'vip' THEN 'Nivel VIP activo (últimos 90 días).'
      WHEN 'frecuente' THEN 'Nivel Frecuente activo (últimos 90 días).'
      ELSE 'Nivel Inicial.'
    END AS condition_label
  FROM calc c;
$$;

REVOKE ALL ON FUNCTION public.get_my_loyalty_category() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty_category() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty_category() TO service_role;
