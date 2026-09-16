-- ============================================================================
-- MIGRACIÓN: 20260915183000_phase_1b_safe_hardening.sql
-- Fase 1B: Hardening Seguro de RPCs y Políticas RLS sin impacto en storefront
-- Fecha: 2026-09-15
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. P-2 SEGURO: Revocar RPCs exclusivas de administración/analítica para anon
-- ----------------------------------------------------------------------------

-- A. get_customer_favorite_products (Usada únicamente en panel admin Customers.jsx)
REVOKE EXECUTE ON FUNCTION public.get_customer_favorite_products(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_favorite_products(uuid, integer) TO authenticated;

-- B. get_product_stats_batch (Métricas de ventas e ingresos por producto)
REVOKE EXECUTE ON FUNCTION public.get_product_stats_batch(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_stats_batch(uuid[]) TO authenticated;

-- C. get_customer_basic_stats (Métricas de gasto total y pedidos de clientes)
REVOKE EXECUTE ON FUNCTION public.get_customer_basic_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_basic_stats(uuid) TO authenticated;

-- NOTA DE COMPATIBILIDAD OPERATIVA:
-- - NO se revoca anon de get_customer_rewards_progress ni generate_personal_reward_code
--   porque son consumidas activamente por la vista cliente /mi-actividad (MyStuff.jsx).
-- - NO se revoca anon de create_order_with_stock_check porque el checkout del cliente
--   opera como anon hasta la Fase 4.
-- Todas ellas mantienen su protección condicional 'IF (SELECT auth.uid()) IS NOT NULL THEN ...'.


-- ----------------------------------------------------------------------------
-- 2. P-4 SEGURO: Eliminar UPDATE irrestricto en product_reviews
-- ----------------------------------------------------------------------------
-- La política anterior 'Public can update reviews' tenía USING(true) WITH CHECK(true),
-- lo que permitía a cualquier usuario anónimo sobreescribir cualquier reseña ajena.
DROP POLICY IF EXISTS "Public can update reviews" ON public.product_reviews;

CREATE POLICY "Authenticated customers can update own reviews"
  ON public.product_reviews
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = product_reviews.customer_id
          AND c.auth_user_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = product_reviews.customer_id
          AND c.auth_user_id = (SELECT auth.uid())
      )
    )
  );
