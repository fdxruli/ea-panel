-- supabase/migrations/20260928230000_loyalty_tiers_audit_hardening.sql
-- Hardening y mejoras de auditoría para niveles dinámicos de clientes:
-- 1. Trigger atómico para unicidad de is_default (previene race conditions)
-- 2. Refinamiento de política RLS para restringir lectura pública solo a tiers activos

-- 1. Trigger para garantizar que solo un tier sea is_default = true de manera atómica
CREATE OR REPLACE FUNCTION public.enforce_single_default_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.customer_loyalty_tiers
    SET is_default = false
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_default_tier ON public.customer_loyalty_tiers;
CREATE TRIGGER trg_enforce_single_default_tier
BEFORE INSERT OR UPDATE OF is_default ON public.customer_loyalty_tiers
FOR EACH ROW
WHEN (NEW.is_default = true)
EXECUTE FUNCTION public.enforce_single_default_tier();

-- 2. Afinar política RLS de lectura:
DROP POLICY IF EXISTS "Anyone can read active loyalty tiers" ON public.customer_loyalty_tiers;
DROP POLICY IF EXISTS "Allow read access to active loyalty tiers for all users" ON public.customer_loyalty_tiers;

CREATE POLICY "Anyone can read active loyalty tiers"
  ON public.customer_loyalty_tiers
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_admin());
