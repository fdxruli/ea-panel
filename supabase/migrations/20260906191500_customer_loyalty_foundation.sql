-- ============================================================================
-- Migration: customer loyalty foundation
-- Description: Base dinámica de categorías de fidelidad para clientes.
--              Solo 3 categorías por ahora: Inicial, Frecuente y VIP.
--              La categoría se calcula, no se almacena, para que pueda subir
--              o bajar conforme cambia el comportamiento del cliente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_customer_loyalty_category(
  p_customer_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH stats AS (
    SELECT
      c.id,
      COUNT(o.id) FILTER (WHERE o.status = 'completado')::int AS completed_orders,
      COALESCE(
        SUM(o.total_amount) FILTER (WHERE o.status = 'completado'),
        0
      )::numeric AS total_spent,
      MAX(o.created_at) FILTER (WHERE o.status = 'completado') AS last_order_date
    FROM public.customers c
    LEFT JOIN public.orders o ON o.customer_id = c.id
    WHERE c.id = p_customer_id
    GROUP BY c.id
  )
  SELECT CASE
    WHEN last_order_date IS NULL THEN 'Inicial'
    WHEN last_order_date < NOW() - INTERVAL '90 days' THEN 'Inicial'
    WHEN total_spent >= 3000 OR completed_orders >= 15 THEN 'VIP'
    WHEN completed_orders >= 3 OR total_spent >= 750 THEN 'Frecuente'
    ELSE 'Inicial'
  END
  FROM stats;
$$;

REVOKE ALL ON FUNCTION public.get_customer_loyalty_category(uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_category(uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_customer_loyalty_category(uuid)
IS 'Calcula dinámicamente la categoría de fidelidad del cliente: Inicial, Frecuente o VIP. La actividad de más de 90 días hace que el cliente vuelva a Inicial.';

-- RPC para que el frontend pueda obtener exclusivamente la categoría,
-- sin duplicar la lógica de negocio en React.
CREATE OR REPLACE FUNCTION public.get_customer_loyalty_profile(
  p_customer_id uuid
)
RETURNS TABLE (
  category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.get_customer_loyalty_category(p_customer_id);
$$;

REVOKE ALL ON FUNCTION public.get_customer_loyalty_profile(uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_profile(uuid)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_customer_loyalty_profile(uuid)
IS 'Expone al cliente su categoría de fidelidad calculada centralmente. Por ahora solo devuelve Inicial, Frecuente o VIP.';
