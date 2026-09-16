-- ============================================================================
-- Migration: 20260916031655_phase_6_profile_blockers_and_reconciliation.sql
-- Module: Customer Profile Security Blocker Remediation & ACL Reconciliation
-- Description:
--   1. BLOQUEADOR B: Drops direct UPDATE policy on public.customers for authenticated
--      clients. Customer profile mutations must occur exclusively through the
--      audited and restricted update_my_customer_profile(p_name text) RPC.
--   2. BLOQUEADOR A: Explicitly revokes EXECUTE privileges from PUBLIC and anon
--      on customer-facing SECURITY DEFINER RPCs (get_my_loyalty_category,
--      set_my_default_customer_address, update_my_customer_profile), granting
--      access strictly to authenticated and internal service roles.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BLOQUEADOR B: PREVENT DIRECT CUSTOMER UPDATES ON public.customers
-- ----------------------------------------------------------------------------
-- Drop the broad authenticated update policy so customers cannot modify sensitive
-- fields (phone, referral_code, referrer_id, referral_count, has_made_first_purchase,
-- auth_user_id, id). Admin full access remains intact via "Admins have full access".
DROP POLICY IF EXISTS "Authenticated customers can update own customer" ON public.customers;

-- ----------------------------------------------------------------------------
-- 2. BLOQUEADOR A: REVOKE anon/PUBLIC EXECUTE GRANTS ON PROFILE RPCS
-- ----------------------------------------------------------------------------

-- A. get_my_loyalty_category()
REVOKE ALL ON FUNCTION public.get_my_loyalty_category() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_loyalty_category() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty_category() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty_category() TO service_role;

-- B. set_my_default_customer_address(uuid)
REVOKE ALL ON FUNCTION public.set_my_default_customer_address(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_default_customer_address(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_default_customer_address(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_default_customer_address(uuid) TO service_role;

-- C. update_my_customer_profile(text)
REVOKE ALL ON FUNCTION public.update_my_customer_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_customer_profile(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_customer_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_customer_profile(text) TO service_role;
