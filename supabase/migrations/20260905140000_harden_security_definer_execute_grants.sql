-- Security hardening for SECURITY DEFINER functions.
-- Privileged RPCs are callable only by authenticated sessions/service_role.
-- Trigger-only functions are not callable through PostgREST.
-- Public/customer-facing RPCs are intentionally left unchanged until their
-- authorization model is migrated to customer auth_user_id.

REVOKE EXECUTE ON FUNCTION public.abrir_caja_segura(text,numeric,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_ingredient_stock(uuid,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid,numeric,timestamptz,public.cart_item[],varchar) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_referral_level(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_product_with_recipe(jsonb,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_product_audience(uuid,uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_customer_referral_count(uuid,integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.abrir_caja_segura(text,numeric,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_ingredient_stock(uuid,numeric,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid,numeric,timestamptz,public.cart_item[],varchar) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_referral_level(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_product_with_recipe(jsonb,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_product_audience(uuid,uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_customer_referral_count(uuid,integer) TO authenticated, service_role;

-- Admin analytics/directory RPCs: no anonymous execution.
REVOKE EXECUTE ON FUNCTION public.get_admin_customer_kpis() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_customers_directory(text,text,text,integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_product_detail_analytics(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_products_directory(text,uuid,text,text,text,text,integer,integer,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_products_kpis() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_detailed_referral_info() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_customers_with_referrals() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats_in_range(timestamptz,timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_admin_customer_kpis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_customers_directory(text,text,text,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_product_detail_analytics(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_products_directory(text,uuid,text,text,text,text,integer,integer,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_products_kpis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_detailed_referral_info() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customers_with_referrals() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats_in_range(timestamptz,timestamptz) TO authenticated, service_role;

-- Trigger-only functions must never be directly callable.
REVOKE EXECUTE ON FUNCTION public.create_admin_for_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_first_purchase_referral() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_first_purchase_referral_on_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.return_stock_on_cancellation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_ingredient_stock_on_purchase() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_order_notification_on_status_change() FROM PUBLIC, anon, authenticated;

-- Pin SECURITY DEFINER search_path.
ALTER FUNCTION public.abrir_caja_segura(text,numeric,uuid) SET search_path=public,pg_temp;
ALTER FUNCTION public.adjust_ingredient_stock(uuid,numeric,text) SET search_path=public,pg_temp;
ALTER FUNCTION public.create_order_with_stock_check(uuid,numeric,timestamptz,public.cart_item[],varchar) SET search_path=public,pg_temp;
ALTER FUNCTION public.delete_referral_level(uuid) SET search_path=public,pg_temp;
ALTER FUNCTION public.save_product_with_recipe(jsonb,jsonb) SET search_path=public,pg_temp;
ALTER FUNCTION public.update_product_audience(uuid,uuid[]) SET search_path=public,pg_temp;
ALTER FUNCTION public.update_customer_referral_count(uuid,integer) SET search_path=public,pg_temp;
ALTER FUNCTION public.send_order_notification_on_status_change() SET search_path=public,pg_temp;

