-- FASE 2A: reconciliación de drift + hardening crítico, forward-only.
-- No modifica identidad de clientes ni customer IDs.

ALTER FUNCTION public.get_dashboard_stats_in_range(timestamptz, timestamptz) RENAME TO get_dashboard_stats_in_range_impl;
ALTER FUNCTION public.get_dashboard_stats_in_range_impl(timestamptz, timestamptz) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats_in_range_impl(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_dashboard_stats_in_range(p_start_date timestamptz, p_end_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden consultar estadísticas del dashboard.';
  END IF;
  RETURN public.get_dashboard_stats_in_range_impl(p_start_date, p_end_date);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats_in_range(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats_in_range(timestamptz, timestamptz) TO authenticated, service_role;

ALTER FUNCTION public.get_advanced_dashboard_stats(timestamptz, timestamptz) RENAME TO get_advanced_dashboard_stats_impl;
ALTER FUNCTION public.get_advanced_dashboard_stats_impl(timestamptz, timestamptz) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.get_advanced_dashboard_stats_impl(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_advanced_dashboard_stats(p_start_date timestamptz, p_end_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden consultar estadísticas avanzadas.';
  END IF;
  RETURN public.get_advanced_dashboard_stats_impl(p_start_date, p_end_date);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_advanced_dashboard_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_advanced_dashboard_stats(timestamptz, timestamptz) TO authenticated, service_role;

ALTER FUNCTION public.update_order_with_stock_sync(uuid, numeric, timestamptz, jsonb, varchar) RENAME TO update_order_with_stock_sync_impl;
ALTER FUNCTION public.update_order_with_stock_sync_impl(uuid, numeric, timestamptz, jsonb, varchar) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.update_order_with_stock_sync_impl(uuid, numeric, timestamptz, jsonb, varchar) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.update_order_with_stock_sync(p_order_id uuid, p_total_amount numeric, p_scheduled_for timestamptz, p_items jsonb, p_notes varchar DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden modificar pedidos.';
  END IF;
  RETURN public.update_order_with_stock_sync_impl(p_order_id, p_total_amount, p_scheduled_for, p_items, p_notes);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_order_with_stock_sync(uuid, numeric, timestamptz, jsonb, varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_with_stock_sync(uuid, numeric, timestamptz, jsonb, varchar) TO authenticated, service_role;

ALTER FUNCTION public.get_product_stats() RENAME TO get_product_stats_impl;
ALTER FUNCTION public.get_product_stats_impl() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.get_product_stats_impl() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_product_stats()
RETURNS TABLE(id uuid, name varchar, description text, price numeric, cost numeric, image_url text, category_id uuid, is_active boolean, created_at timestamptz, total_sold bigint, total_revenue numeric, avg_rating numeric, reviews_count bigint, favorites_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden consultar estadísticas de productos.';
  END IF;
  RETURN QUERY SELECT * FROM public.get_product_stats_impl();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_product_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_stats() TO authenticated, service_role;

ALTER FUNCTION public.get_special_prices_with_details() RENAME TO get_special_prices_with_details_impl;
ALTER FUNCTION public.get_special_prices_with_details_impl() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.get_special_prices_with_details_impl() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_special_prices_with_details()
RETURNS TABLE(id uuid, product_id uuid, category_id uuid, override_price numeric, start_date date, end_date date, reason text, target_customer_ids uuid[], product_name varchar, category_name varchar, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden consultar precios especiales.';
  END IF;
  RETURN QUERY SELECT * FROM public.get_special_prices_with_details_impl();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_special_prices_with_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_special_prices_with_details() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.increment_referral_count(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.record_discount_usage_and_deactivate(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discount_usage_and_deactivate(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.order_profits AS
 SELECT o.id AS order_id,
    o.order_code,
    o.customer_id,
    o.status,
    o.total_amount,
    o.created_at,
    sum(((oi.price - p.cost) * oi.quantity::numeric)) AS total_profit_without_discount,
    sum((oi.price * oi.quantity::numeric)) AS subtotal,
    COALESCE(o.total_amount, sum((oi.price * oi.quantity::numeric))) AS final_total,
    (sum((oi.price * oi.quantity::numeric)) - o.total_amount) AS discount_applied,
    (o.total_amount - sum((p.cost * oi.quantity::numeric))) AS total_profit
   FROM public.orders o
   JOIN public.order_items oi ON o.id = oi.order_id
   JOIN public.products p ON oi.product_id = p.id
  WHERE public.is_admin()
  GROUP BY o.id, o.order_code, o.customer_id, o.status, o.total_amount, o.created_at;
ALTER VIEW public.order_profits SET (security_invoker = true);
REVOKE ALL ON public.order_profits FROM PUBLIC, anon;
GRANT SELECT ON public.order_profits TO authenticated, service_role;

CREATE OR REPLACE VIEW public.discounts_with_targets AS
 SELECT d.id,
    d.code,
    d.type,
    d.value,
    d.target_id,
    d.start_date,
    d.end_date,
    d.is_active,
    d.is_single_use,
    d.created_at,
    p.name AS product_name,
    c.name AS category_name
   FROM public.discounts d
   LEFT JOIN public.products p ON d.type = 'product'::discount_type AND d.target_id = p.id
   LEFT JOIN public.categories c ON d.type = 'category'::discount_type AND d.target_id = c.id
  WHERE public.is_admin();
ALTER VIEW public.discounts_with_targets SET (security_invoker = true);
REVOKE ALL ON public.discounts_with_targets FROM PUBLIC, anon;
GRANT SELECT ON public.discounts_with_targets TO authenticated, service_role;

REVOKE ALL ON public.dashboard_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dashboard_stats TO service_role;

ALTER FUNCTION public.get_business_status() SECURITY INVOKER;
ALTER FUNCTION public.get_business_status() SET search_path = public;
ALTER FUNCTION public.get_active_menu_products(uuid) SET search_path = public;
