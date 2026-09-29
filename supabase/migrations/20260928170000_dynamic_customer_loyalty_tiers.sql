-- ============================================================================
-- Migration: 20260928170000_dynamic_customer_loyalty_tiers.sql
-- Description:
--   1. Crea la tabla customer_loyalty_tiers para gestionar dinámicamente
--      los niveles de clientes (VIP, Frecuente, Inicial, etc.), sus límites
--      de pedidos, gastos mínimos, ventana de evaluación, rango y beneficios.
--   2. Actualiza get_customer_loyalty_tier(uuid) para evaluar dinámicamente
--      los niveles configurados por el administrador sin requerir cambios de código.
--   3. Actualiza get_my_loyalty_category(uuid) para vincular dinámicamente nombres
--      y beneficios desde customer_loyalty_tiers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  slug varchar(50) NOT NULL UNIQUE,
  min_orders integer NOT NULL DEFAULT 0,
  min_spent numeric(10,2) NOT NULL DEFAULT 0,
  period_days integer NOT NULL DEFAULT 90,
  rank_priority integer NOT NULL DEFAULT 0,
  color varchar(30) DEFAULT '#eab308',
  badge_text varchar(50) DEFAULT NULL,
  benefit_description text DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_loyalty_tiers_rank
  ON public.customer_loyalty_tiers (rank_priority DESC, min_spent DESC);

ALTER TABLE public.customer_loyalty_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active loyalty tiers" ON public.customer_loyalty_tiers;
CREATE POLICY "Anyone can read active loyalty tiers"
  ON public.customer_loyalty_tiers
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage loyalty tiers" ON public.customer_loyalty_tiers;
CREATE POLICY "Admins can manage loyalty tiers"
  ON public.customer_loyalty_tiers
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.customer_loyalty_tiers (name, slug, min_orders, min_spent, period_days, rank_priority, color, badge_text, benefit_description, is_active, is_default)
VALUES 
  ('VIP', 'vip', 15, 3000.00, 90, 100, '#eab308', 'VIP', 'Consumo > $3,000 o > 15 pedidos completados en los últimos 90 días.', true, false),
  ('Frecuente', 'frecuente', 3, 750.00, 90, 50, '#38bdf8', 'Frecuente', 'Consumo > $750 o > 3 pedidos completados en los últimos 90 días.', true, false),
  ('Inicial', 'inicial', 0, 0.00, 90, 0, '#94a3b8', 'Inicial', 'Nivel base para todos los clientes.', true, true)
ON CONFLICT (slug) DO UPDATE
SET 
  name = EXCLUDED.name,
  min_orders = EXCLUDED.min_orders,
  min_spent = EXCLUDED.min_spent,
  period_days = EXCLUDED.period_days,
  rank_priority = EXCLUDED.rank_priority,
  color = EXCLUDED.color,
  badge_text = EXCLUDED.badge_text,
  benefit_description = EXCLUDED.benefit_description,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default;

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
  v_default_tier text := 'inicial';
  v_tier RECORD;
  v_total_spent numeric := 0;
  v_completed_orders bigint := 0;
  v_last_order_date timestamptz;
BEGIN
  IF p_customer_id IS NULL THEN
    SELECT slug INTO v_default_tier 
    FROM public.customer_loyalty_tiers 
    WHERE is_default = true 
    LIMIT 1;
    RETURN COALESCE(v_default_tier, 'inicial');
  END IF;

  -- 1. Si el cliente tiene un nivel asignado o promovido manualmente en customers
  SELECT loyalty_tier INTO v_manual_tier
  FROM public.customers
  WHERE id = p_customer_id;

  IF v_manual_tier IS NOT NULL AND btrim(v_manual_tier) != '' THEN
    RETURN lower(btrim(v_manual_tier));
  END IF;

  -- Obtener slug default
  SELECT slug INTO v_default_tier 
  FROM public.customer_loyalty_tiers 
  WHERE is_default = true 
  LIMIT 1;
  IF v_default_tier IS NULL THEN
    v_default_tier := 'inicial';
  END IF;

  -- 2. Evaluar niveles dinámicos configurados en customer_loyalty_tiers de mayor a menor prioridad
  FOR v_tier IN
    SELECT slug, min_orders, min_spent, period_days
    FROM public.customer_loyalty_tiers
    WHERE is_active = true AND is_default = false
    ORDER BY rank_priority DESC, min_spent DESC
  LOOP
    -- Calcular compras dentro de la ventana de días del nivel
    IF v_tier.period_days IS NOT NULL AND v_tier.period_days > 0 THEN
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
        AND o.status = 'completado'::public.order_status
        AND o.created_at >= NOW() - (v_tier.period_days || ' days')::interval;
    ELSE
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
    END IF;

    -- Cumple condición si alcanza el gasto mínimo o los pedidos mínimos (siempre que min > 0)
    IF (v_tier.min_spent > 0 AND v_total_spent >= v_tier.min_spent)
       OR (v_tier.min_orders > 0 AND v_completed_orders >= v_tier.min_orders) THEN
      RETURN v_tier.slug;
    END IF;
  END LOOP;

  RETURN v_default_tier;
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
  v_tier_slug text;
  v_tier_record RECORD;
BEGIN
  IF p_customer_id IS NOT NULL THEN
    v_target_id := p_customer_id;
  ELSIF (SELECT auth.uid()) IS NOT NULL THEN
    SELECT id INTO v_target_id FROM public.customers WHERE auth_user_id = (SELECT auth.uid()) LIMIT 1;
  END IF;

  IF v_target_id IS NULL THEN
    SELECT * INTO v_tier_record FROM public.customer_loyalty_tiers WHERE is_default = true LIMIT 1;
    RETURN QUERY SELECT 
      COALESCE(v_tier_record.slug, 'inicial')::text AS category,
      COALESCE(v_tier_record.benefit_description, 'Comienza a disfrutar de nuestras promociones.')::text AS benefit_label,
      COALESCE(v_tier_record.name, 'Nivel Inicial')::text AS condition_label;
    RETURN;
  END IF;

  v_tier_slug := public.get_customer_loyalty_tier(v_target_id);

  SELECT * INTO v_tier_record 
  FROM public.customer_loyalty_tiers 
  WHERE slug = v_tier_slug 
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_tier_slug AS category,
      COALESCE(v_tier_record.benefit_description, 'Disfruta de tus beneficios exclusivos.')::text AS benefit_label,
      ('Nivel ' || v_tier_record.name || ' activo.')::text AS condition_label;
  ELSE
    RETURN QUERY SELECT
      v_tier_slug AS category,
      'Comienza a disfrutar de nuestras promociones.'::text AS benefit_label,
      'Nivel Inicial.'::text AS condition_label;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_loyalty_category(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty_category(uuid) TO anon, authenticated, service_role;
