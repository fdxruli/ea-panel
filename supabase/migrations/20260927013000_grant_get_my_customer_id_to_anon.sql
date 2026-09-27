-- ============================================================================
-- Migration: 20260927013000_grant_get_my_customer_id_to_anon.sql
-- Description: Concede permisos EXECUTE en get_my_customer_id a anon
--              para evitar error 401 (42501 permission denied) al consultar
--              descuentos desde el carrito como usuario público o cliente web.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_my_customer_id() TO anon, authenticated, service_role;
