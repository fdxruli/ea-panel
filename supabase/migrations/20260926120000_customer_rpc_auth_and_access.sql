-- ============================================================================
-- Migration: 20260926120000_customer_rpc_auth_and_access.sql
-- Module: Secure Customer Access via RPC & Transition Policies
-- Description:
--   1. Provides verify_customer_by_phone(p_phone) for safe phone verification
--      without exposing public.customers to bulk table scraping.
--   2. Provides register_customer_by_phone(p_phone, p_name, p_referrer_code)
--      for new customer onboarding.
--   3. Provides accept_customer_terms(p_customer_id, p_terms_version_id).
--   4. Provides get_customer_referral_status(p_customer_id) for cart discounts.
--   5. Restores transition policies for addresses, favorites, and orders so that
--      logged-in WhatsApp customers can view and manage their data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. VERIFY CUSTOMER BY PHONE RPC
-- ----------------------------------------------------------------------------
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
BEGIN
  v_clean_phone := btrim(coalesce(p_phone, ''));
  IF length(v_clean_phone) < 10 THEN
    RETURN jsonb_build_object('found', false, 'code', 'invalid_phone');
  END IF;

  -- Buscar cliente por teléfono exacto o normalizado
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

  -- Buscar versión activa de términos
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
      'terms_accepted', v_has_accepted
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_customer_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_customer_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_customer_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_customer_by_phone(text) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. REGISTER CUSTOMER BY PHONE RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_customer_by_phone(
  p_phone text,
  p_name text,
  p_referrer_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_phone text;
  v_clean_name text;
  v_existing record;
  v_referrer_id uuid := NULL;
  v_base_code text;
  v_code text;
  v_counter integer := 1;
  v_new_customer record;
BEGIN
  v_clean_phone := btrim(coalesce(p_phone, ''));
  v_clean_name := btrim(coalesce(p_name, ''));

  IF length(v_clean_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;

  IF length(v_clean_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  IF length(v_clean_phone) = 10 AND v_clean_phone NOT LIKE '+%' THEN
    v_clean_phone := '+52' || v_clean_phone;
  END IF;

  SELECT * INTO v_existing
  FROM public.customers c
  WHERE c.phone = v_clean_phone
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'customer', jsonb_build_object(
        'id', v_existing.id,
        'name', v_existing.name,
        'phone', v_existing.phone,
        'referral_code', v_existing.referral_code,
        'referrer_id', v_existing.referrer_id,
        'referral_count', v_existing.referral_count,
        'has_made_first_purchase', v_existing.has_made_first_purchase,
        'birthdate', v_existing.birthdate,
        'created_at', v_existing.created_at
      )
    );
  END IF;

  IF p_referrer_code IS NOT NULL AND btrim(p_referrer_code) <> '' THEN
    SELECT id INTO v_referrer_id
    FROM public.customers
    WHERE upper(referral_code) = upper(btrim(p_referrer_code))
    LIMIT 1;
  END IF;

  v_base_code := 'EA-' || upper(substr(regexp_replace(v_clean_name, '[^[:alnum:]]', '', 'g'), 1, 2)) || right(regexp_replace(v_clean_phone, '[^0-9]', '', 'g'), 2);
  IF length(v_base_code) < 6 THEN
    v_base_code := 'EA-CL' || right(regexp_replace(v_clean_phone, '[^0-9]', '', 'g'), 2);
  END IF;

  v_code := v_base_code;
  WHILE EXISTS (SELECT 1 FROM public.customers WHERE referral_code = v_code) LOOP
    v_counter := v_counter + 1;
    v_code := v_base_code || '-' || v_counter;
  END LOOP;

  INSERT INTO public.customers (
    name,
    phone,
    referral_code,
    referrer_id,
    referral_count,
    has_made_first_purchase
  )
  VALUES (
    v_clean_name,
    v_clean_phone,
    v_code,
    v_referrer_id,
    0,
    false
  )
  RETURNING * INTO v_new_customer;

  RETURN jsonb_build_object(
    'ok', true,
    'customer', jsonb_build_object(
      'id', v_new_customer.id,
      'name', v_new_customer.name,
      'phone', v_new_customer.phone,
      'referral_code', v_new_customer.referral_code,
      'referrer_id', v_new_customer.referrer_id,
      'referral_count', v_new_customer.referral_count,
      'has_made_first_purchase', v_new_customer.has_made_first_purchase,
      'birthdate', v_new_customer.birthdate,
      'created_at', v_new_customer.created_at
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.customers WHERE phone = v_clean_phone LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'customer', jsonb_build_object(
          'id', v_existing.id,
          'name', v_existing.name,
          'phone', v_existing.phone,
          'referral_code', v_existing.referral_code,
          'referrer_id', v_existing.referrer_id,
          'referral_count', v_existing.referral_count,
          'has_made_first_purchase', v_existing.has_made_first_purchase,
          'birthdate', v_existing.birthdate,
          'created_at', v_existing.created_at
        )
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.register_customer_by_phone(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_customer_by_phone(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.register_customer_by_phone(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_customer_by_phone(text, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. ACCEPT CUSTOMER TERMS RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_customer_terms(
  p_customer_id uuid,
  p_terms_version_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_terms_id uuid := p_terms_version_id;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_customer_id');
  END IF;

  IF v_terms_id IS NULL THEN
    SELECT id INTO v_terms_id
    FROM public.terms_and_conditions
    ORDER BY version DESC
    LIMIT 1;
  END IF;

  IF v_terms_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'terms_unavailable');
  END IF;

  INSERT INTO public.customer_terms_acceptances (customer_id, terms_version_id, accepted_at)
  VALUES (p_customer_id, v_terms_id, now())
  ON CONFLICT (customer_id, terms_version_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'code', 'accepted', 'terms_id', v_terms_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'acceptance_failed', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_customer_terms(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_customer_terms(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_customer_terms(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_customer_terms(uuid, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. GET CUSTOMER REFERRAL STATUS RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_referral_status(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT referrer_id, has_made_first_purchase INTO v_rec
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'referrer_id', v_rec.referrer_id,
    'has_made_first_purchase', v_rec.has_made_first_purchase
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_referral_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_referral_status(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_customer_referral_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_referral_status(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. TRANSITION ACCESS FOR ADDRESSES, FAVORITES, ORDERS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Addresses
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_addresses' AND policyname = 'Legacy anonymous can manage addresses') THEN
    CREATE POLICY "Legacy anonymous can manage addresses" ON public.customer_addresses FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  -- Favorites
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_favorites' AND policyname = 'Legacy anonymous can manage favorites') THEN
    CREATE POLICY "Legacy anonymous can manage favorites" ON public.customer_favorites FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  -- Orders
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Legacy anonymous can view orders') THEN
    CREATE POLICY "Legacy anonymous can view orders" ON public.orders FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Legacy anonymous can insert orders') THEN
    CREATE POLICY "Legacy anonymous can insert orders" ON public.orders FOR INSERT TO anon WITH CHECK (true);
  END IF;

  -- Order items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'Legacy anonymous can view order items') THEN
    CREATE POLICY "Legacy anonymous can view order items" ON public.order_items FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'Legacy anonymous can insert order items') THEN
    CREATE POLICY "Legacy anonymous can insert order items" ON public.order_items FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;
