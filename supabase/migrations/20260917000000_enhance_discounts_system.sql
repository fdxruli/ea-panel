-- Migration: 20260917000000_enhance_discounts_system.sql
-- Purpose: Add discount_mode ('percentage' vs 'fixed'), enhance discounts_with_targets view with customer and referral info

-- 1. Add discount_mode column to discounts table
ALTER TABLE public.discounts
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'percentage';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'discounts_discount_mode_check'
      AND conrelid = 'public.discounts'::regclass
  ) THEN
    ALTER TABLE public.discounts
      ADD CONSTRAINT discounts_discount_mode_check CHECK (discount_mode IN ('percentage', 'fixed'));
  END IF;
END $$;

-- 2. Indexes for customer-assigned and referral discounts
CREATE INDEX IF NOT EXISTS idx_discounts_specific_customer
  ON public.discounts (specific_customer_id)
  WHERE specific_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discounts_requires_referred
  ON public.discounts (requires_referred_status)
  WHERE requires_referred_status = true;

-- 3. Enhance discounts_with_targets view to include discount_mode, referral status, and customer details
DROP VIEW IF EXISTS public.discounts_with_targets;

CREATE VIEW public.discounts_with_targets AS
 SELECT d.id,
    d.code,
    d.type,
    d.value,
    d.discount_mode,
    d.target_id,
    d.start_date,
    d.end_date,
    d.is_active,
    d.is_single_use,
    d.requires_referred_status,
    d.specific_customer_id,
    d.created_at,
    p.name AS product_name,
    c.name AS category_name,
    cust.name AS customer_name,
    cust.phone AS customer_phone
   FROM public.discounts d
   LEFT JOIN public.products p ON d.type = 'product'::discount_type AND d.target_id = p.id
   LEFT JOIN public.categories c ON d.type = 'category'::discount_type AND d.target_id = c.id
   LEFT JOIN public.customers cust ON d.specific_customer_id = cust.id
  WHERE public.is_admin();

ALTER VIEW public.discounts_with_targets SET (security_invoker = true);
REVOKE ALL ON public.discounts_with_targets FROM PUBLIC, anon;
GRANT SELECT ON public.discounts_with_targets TO authenticated, service_role;
