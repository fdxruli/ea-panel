-- ============================================================================
-- Migration: 20260916000000_phase_6_customer_profile_security.sql
-- Module: Customer Profile Security Hardening (Phase 6 / RLS)
-- Description:
--   1. Restricts public.customers RLS to authenticated owners and admins.
--      Removes legacy anonymous view and insert policies.
--   2. Restricts public.customer_addresses RLS to authenticated owners and admins.
--      Removes legacy anonymous manage policy.
--   3. Restricts public.customer_favorites RLS to authenticated owners and admins.
--      Removes legacy anonymous manage policy.
--   4. Restricts public.customer_reward_claims and customer_terms_acceptances.
--   5. Revokes public execution grants to anon for customer-id-accepting RPCs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CUSTOMERS TABLE POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Drop permissive legacy policies for anon
DROP POLICY IF EXISTS "Legacy anonymous can view customers" ON public.customers;
DROP POLICY IF EXISTS "Legacy anonymous can insert customers" ON public.customers;

-- Ensure authenticated customer view policy is strictly scoped to auth.uid()
DROP POLICY IF EXISTS "Authenticated customers can view own customer" ON public.customers;
CREATE POLICY "Authenticated customers can view own customer"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = auth_user_id);

-- Ensure authenticated customer update policy is strictly scoped to auth.uid()
DROP POLICY IF EXISTS "Authenticated customers can update own customer" ON public.customers;
CREATE POLICY "Authenticated customers can update own customer"
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = auth_user_id)
  WITH CHECK ((SELECT auth.uid()) = auth_user_id);

-- ----------------------------------------------------------------------------
-- 2. CUSTOMER_ADDRESSES TABLE POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Drop permissive legacy policy for anon
DROP POLICY IF EXISTS "Legacy anonymous can manage addresses" ON public.customer_addresses;

-- Recreate or ensure authenticated policies validate customer ownership via auth_user_id
DROP POLICY IF EXISTS "Authenticated customers can read own addresses" ON public.customer_addresses;
CREATE POLICY "Authenticated customers can read own addresses"
  ON public.customer_addresses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated customers can insert own addresses" ON public.customer_addresses;
CREATE POLICY "Authenticated customers can insert own addresses"
  ON public.customer_addresses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated customers can update own addresses" ON public.customer_addresses;
CREATE POLICY "Authenticated customers can update own addresses"
  ON public.customer_addresses
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated customers can delete own addresses" ON public.customer_addresses;
CREATE POLICY "Authenticated customers can delete own addresses"
  ON public.customer_addresses
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 3. CUSTOMER_FAVORITES TABLE POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;

-- Drop permissive legacy policy for anon
DROP POLICY IF EXISTS "Legacy anonymous can manage favorites" ON public.customer_favorites;

DROP POLICY IF EXISTS "Authenticated customers can read own favorites" ON public.customer_favorites;
CREATE POLICY "Authenticated customers can read own favorites"
  ON public.customer_favorites
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_favorites.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated customers can insert own favorites" ON public.customer_favorites;
CREATE POLICY "Authenticated customers can insert own favorites"
  ON public.customer_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_favorites.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated customers can update own favorites" ON public.customer_favorites;
CREATE POLICY "Authenticated customers can update own favorites"
  ON public.customer_favorites
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_favorites.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_favorites.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated customers can delete own favorites" ON public.customer_favorites;
CREATE POLICY "Authenticated customers can delete own favorites"
  ON public.customer_favorites
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_favorites.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 4. CUSTOMER_REWARD_CLAIMS & CUSTOMER_TERMS_ACCEPTANCES
-- ----------------------------------------------------------------------------
ALTER TABLE public.customer_reward_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view their reward claims" ON public.customer_reward_claims;
CREATE POLICY "Customers can view their reward claims"
  ON public.customer_reward_claims
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_reward_claims.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

ALTER TABLE public.customer_terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view terms acceptances" ON public.customer_terms_acceptances;
CREATE POLICY "Customers can view terms acceptances"
  ON public.customer_terms_acceptances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_terms_acceptances.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Customers can insert terms acceptances" ON public.customer_terms_acceptances;
CREATE POLICY "Customers can insert terms acceptances"
  ON public.customer_terms_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_terms_acceptances.customer_id
        AND c.auth_user_id = (SELECT auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 5. REVOKE ANONYMOUS ACCESS TO LEGACY UNVERIFIED RPCS
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.generate_personal_reward_code(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_rewards_progress(uuid) FROM anon;
