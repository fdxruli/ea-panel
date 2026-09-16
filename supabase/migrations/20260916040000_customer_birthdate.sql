-- ============================================================================
-- Migration: 20260916040000_customer_birthdate.sql
-- Module: Customer Profile Birthday Integration
-- Description:
--   1. Adds birthdate (date, null) column to public.customers.
--   2. Updates public.update_my_customer_profile to accept p_birthdate (optional).
--   3. Secures execute privileges strictly to authenticated and service_role.
-- ============================================================================

-- 1. Add birthdate column to public.customers
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS birthdate date NULL;

-- 2. Replace update_my_customer_profile RPC
DROP FUNCTION IF EXISTS public.update_my_customer_profile(text);
DROP FUNCTION IF EXISTS public.update_my_customer_profile(text, date);

CREATE OR REPLACE FUNCTION public.update_my_customer_profile(
  p_name text,
  p_birthdate date DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name character varying,
  phone character varying,
  referral_code character varying,
  birthdate date
)
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

  IF p_birthdate IS NOT NULL THEN
    IF p_birthdate > CURRENT_DATE OR p_birthdate < (CURRENT_DATE - INTERVAL '120 years') THEN
      RAISE EXCEPTION 'invalid_birthdate' USING errcode = 'P0001';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.customers c
  SET name = v_clean_name,
      birthdate = p_birthdate
  WHERE c.id = v_customer_id
  RETURNING c.id, c.name, c.phone, c.referral_code, c.birthdate;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_customer_profile(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_customer_profile(text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_customer_profile(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_customer_profile(text, date) TO service_role;
