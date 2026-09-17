-- ============================================================================
-- Migración: 20260917010000_harden_special_prices_system.sql
-- Propósito:
--   1. Añadir columna is_active a public.special_prices.
--   2. Restricciones de integridad (fechas válidas, exclusión mutua producto/categoría).
--   3. Políticas RLS para administradores y lectura pública de precios activos.
--   4. RPCs administrativas seguras:
--      - admin_save_special_price(p_special_price jsonb)
--      - admin_delete_special_price(p_id uuid)
--      - admin_toggle_special_price(p_id uuid, p_is_active boolean)
--   5. Actualización de funciones de lectura get_special_prices_with_details,
--      get_public_special_prices y get_my_special_prices.
-- ============================================================================

-- 1. Columna is_active
ALTER TABLE public.special_prices
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Restricciones de integridad
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'special_prices_dates_check'
      AND conrelid = 'public.special_prices'::regclass
  ) THEN
    ALTER TABLE public.special_prices
      ADD CONSTRAINT special_prices_dates_check CHECK (end_date >= start_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'special_prices_target_check'
      AND conrelid = 'public.special_prices'::regclass
  ) THEN
    ALTER TABLE public.special_prices
      ADD CONSTRAINT special_prices_target_check
      CHECK (
        (product_id IS NOT NULL AND category_id IS NULL) OR
        (product_id IS NULL AND category_id IS NOT NULL)
      );
  END IF;
END $$;

-- 3. Permisos y Políticas RLS
GRANT ALL ON public.special_prices TO authenticated;
GRANT SELECT ON public.special_prices TO anon;

ALTER TABLE public.special_prices ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas previas para recrear limpias
DROP POLICY IF EXISTS special_prices_admin_all ON public.special_prices;
CREATE POLICY special_prices_admin_all
  ON public.special_prices
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS special_prices_public_read ON public.special_prices;
CREATE POLICY special_prices_public_read
  ON public.special_prices
  FOR SELECT
  TO anon, authenticated
  USING (
    public.is_admin() OR (
      is_active = true
      AND (target_customer_ids IS NULL OR cardinality(target_customer_ids) = 0)
    )
  );

-- 4. RPCs Administrativas

-- 4.1 admin_save_special_price
CREATE OR REPLACE FUNCTION public.admin_save_special_price(p_special_price jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_product_id uuid := NULL;
  v_category_id uuid := NULL;
  v_override_price numeric;
  v_start_date date;
  v_end_date date;
  v_reason text;
  v_is_active boolean;
  v_target_customer_ids uuid[] := NULL;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  -- Extraer ID si existe
  IF p_special_price ? 'id' AND p_special_price->>'id' IS NOT NULL AND p_special_price->>'id' <> '' THEN
    v_id := (p_special_price->>'id')::uuid;
  ELSE
    v_id := gen_random_uuid();
  END IF;

  -- Targets
  IF p_special_price ? 'product_id' AND p_special_price->>'product_id' IS NOT NULL AND p_special_price->>'product_id' <> '' THEN
    v_product_id := (p_special_price->>'product_id')::uuid;
  END IF;

  IF p_special_price ? 'category_id' AND p_special_price->>'category_id' IS NOT NULL AND p_special_price->>'category_id' <> '' THEN
    v_category_id := (p_special_price->>'category_id')::uuid;
  END IF;

  IF (v_product_id IS NULL AND v_category_id IS NULL) OR (v_product_id IS NOT NULL AND v_category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Debe seleccionar exactamente un producto o una categoría.';
  END IF;

  -- Precio
  v_override_price := (p_special_price->>'override_price')::numeric;
  IF v_override_price IS NULL OR v_override_price < 0 THEN
    RAISE EXCEPTION 'El precio especial debe ser mayor o igual a 0.';
  END IF;

  -- Fechas
  v_start_date := (p_special_price->>'start_date')::date;
  v_end_date := (p_special_price->>'end_date')::date;
  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE EXCEPTION 'Las fechas de inicio y fin son obligatorias.';
  END IF;
  IF v_end_date < v_start_date THEN
    RAISE EXCEPTION 'La fecha de fin no puede ser anterior a la de inicio.';
  END IF;

  v_reason := NULLIF(trim(p_special_price->>'reason'), '');
  v_is_active := COALESCE((p_special_price->>'is_active')::boolean, true);

  -- Clientes objetivo
  IF p_special_price ? 'target_customer_ids' AND p_special_price->'target_customer_ids' IS NOT NULL AND jsonb_typeof(p_special_price->'target_customer_ids') = 'array' THEN
    SELECT COALESCE(array_agg(DISTINCT elem::uuid), NULL)
    INTO v_target_customer_ids
    FROM jsonb_array_elements_text(p_special_price->'target_customer_ids') AS elem
    WHERE elem IS NOT NULL AND elem <> '';

    IF array_length(v_target_customer_ids, 1) IS NULL THEN
      v_target_customer_ids := NULL;
    END IF;
  END IF;

  -- Upsert
  INSERT INTO public.special_prices (
    id,
    product_id,
    category_id,
    override_price,
    start_date,
    end_date,
    reason,
    is_active,
    target_customer_ids
  ) VALUES (
    v_id,
    v_product_id,
    v_category_id,
    v_override_price,
    v_start_date,
    v_end_date,
    v_reason,
    v_is_active,
    v_target_customer_ids
  )
  ON CONFLICT (id) DO UPDATE
  SET
    product_id = EXCLUDED.product_id,
    category_id = EXCLUDED.category_id,
    override_price = EXCLUDED.override_price,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    reason = EXCLUDED.reason,
    is_active = EXCLUDED.is_active,
    target_customer_ids = EXCLUDED.target_customer_ids;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_special_price(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_special_price(jsonb) TO authenticated, service_role;

-- 4.2 admin_delete_special_price
CREATE OR REPLACE FUNCTION public.admin_delete_special_price(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  DELETE FROM public.special_prices WHERE id = p_id;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_special_price(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_special_price(uuid) TO authenticated, service_role;

-- 4.3 admin_toggle_special_price
CREATE OR REPLACE FUNCTION public.admin_toggle_special_price(p_id uuid, p_is_active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
  END IF;

  UPDATE public.special_prices
  SET is_active = p_is_active
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_toggle_special_price(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_special_price(uuid, boolean) TO authenticated, service_role;

-- 5. Actualización de vistas/funciones de lectura

-- 5.1 get_special_prices_with_details_impl
CREATE OR REPLACE FUNCTION public.get_special_prices_with_details_impl()
RETURNS TABLE(
  id uuid,
  product_id uuid,
  category_id uuid,
  override_price numeric,
  start_date date,
  end_date date,
  reason text,
  target_customer_ids uuid[],
  product_name character varying,
  category_name character varying,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.id,
    sp.product_id,
    sp.category_id,
    sp.override_price,
    sp.start_date,
    sp.end_date,
    sp.reason,
    sp.target_customer_ids,
    p.name AS product_name,
    c.name AS category_name,
    sp.is_active
  FROM public.special_prices sp
  LEFT JOIN public.products p ON sp.product_id = p.id
  LEFT JOIN public.categories c ON sp.category_id = c.id
  ORDER BY sp.end_date DESC, sp.start_date DESC;
END;
$$;

-- 5.2 get_public_special_prices
CREATE OR REPLACE FUNCTION public.get_public_special_prices()
RETURNS TABLE(
  id uuid,
  product_id uuid,
  category_id uuid,
  override_price numeric,
  start_date date,
  end_date date,
  reason text,
  product_name character varying,
  category_name character varying,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    sp.id, sp.product_id, sp.category_id, sp.override_price, sp.start_date, sp.end_date, sp.reason,
    p.name, c.name, true
  FROM public.special_prices sp
  LEFT JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN public.categories c ON c.id = sp.category_id
  WHERE sp.is_active = true
    AND current_date BETWEEN sp.start_date AND sp.end_date
    AND (sp.target_customer_ids IS NULL OR cardinality(sp.target_customer_ids) = 0);
$$;

-- 5.3 get_my_special_prices
CREATE OR REPLACE FUNCTION public.get_my_special_prices()
RETURNS TABLE(
  id uuid,
  product_id uuid,
  category_id uuid,
  override_price numeric,
  start_date date,
  end_date date,
  reason text,
  product_name character varying,
  category_name character varying,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_customer_id uuid := NULL;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    SELECT c.id INTO v_customer_id FROM public.customers c WHERE c.auth_user_id = (SELECT auth.uid()) LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    sp.id, sp.product_id, sp.category_id, sp.override_price, sp.start_date, sp.end_date, sp.reason,
    p.name, c.name, true
  FROM public.special_prices sp
  LEFT JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN public.categories c ON c.id = sp.category_id
  WHERE sp.is_active = true
    AND current_date BETWEEN sp.start_date AND sp.end_date
    AND (
      sp.target_customer_ids IS NULL
      OR cardinality(sp.target_customer_ids) = 0
      OR (v_customer_id IS NOT NULL AND v_customer_id = ANY(sp.target_customer_ids))
    );
END;
$$;
