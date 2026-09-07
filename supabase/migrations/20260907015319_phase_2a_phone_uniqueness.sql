-- Preconditions verified in the Phase 2A production audit:
-- public.customers.phone is NOT NULL for all existing rows and has no duplicates.
ALTER TABLE public.customers
  ADD CONSTRAINT customers_phone_key UNIQUE (phone);
