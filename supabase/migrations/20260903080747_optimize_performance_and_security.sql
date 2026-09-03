-- =======================================================
-- 1. CREACIÓN DE ÍNDICES PARA LLAVES FORÁNEAS (Rendimiento)
-- =======================================================
CREATE INDEX IF NOT EXISTS idx_cash_movements_realizado_por ON public.cash_movements(realizado_por);
CREATE INDEX IF NOT EXISTS idx_cash_registers_closed_by ON public.cash_registers(closed_by);
CREATE INDEX IF NOT EXISTS idx_customer_discount_usage_discount_id ON public.customer_discount_usage(discount_id);
CREATE INDEX IF NOT EXISTS idx_customer_reward_claims_reward_id ON public.customer_reward_claims(reward_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_purchase_units_ingredient_id ON public.ingredient_purchase_units(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_purchases_ingredient_id ON public.ingredient_purchases(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_purchases_purchase_unit_id ON public.ingredient_purchases(purchase_unit_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_ingredient_id ON public.product_recipes(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_product_id ON public.product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_rewards_level_id ON public.rewards(level_id);

-- =======================================================
-- 2. REVOCAR ACCESO PÚBLICO A FUNCIONES SECURITY DEFINER (Seguridad)
-- =======================================================
REVOKE EXECUTE ON FUNCTION public.abrir_caja_segura(text, numeric, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjust_ingredient_stock(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_admin_for_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamp with time zone, public.cart_item[], character varying) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_referral_level(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_personal_reward_code(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_basic_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_rewards_progress(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_stats_batch(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customers_with_referrals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_detailed_referral_info() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_first_purchase_referral() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_first_purchase_referral_on_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_referral_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.return_stock_on_cancellation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_product_with_recipe(jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_order_with_stock_check(uuid, numeric, timestamp with time zone, public.cart_item[], character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_caja_segura(text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_ingredient_stock(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_referral_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_personal_reward_code(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_basic_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_rewards_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_stats_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customers_with_referrals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_detailed_referral_info() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_stock_on_cancellation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_with_recipe(jsonb, jsonb) TO authenticated;

-- =======================================================
-- 3. FIJAR SEARCH_PATH EN FUNCIONES SECURITY DEFINER (Seguridad)
-- =======================================================
ALTER FUNCTION public.create_admin_for_new_user() SET search_path = public;
ALTER FUNCTION public.handle_first_purchase_referral() SET search_path = public;
ALTER FUNCTION public.refresh_dashboard_stats() SET search_path = public;
ALTER FUNCTION public.get_business_status() SET search_path = public;
ALTER FUNCTION public.update_customer_referral_count() SET search_path = public;
ALTER FUNCTION public.increment_referral_count(uuid) SET search_path = public;
ALTER FUNCTION public.handle_first_purchase_referral_on_update() SET search_path = public;
ALTER FUNCTION public.adjust_ingredient_stock(uuid, numeric, text) SET search_path = public;
ALTER FUNCTION public.generate_order_code() SET search_path = public;
ALTER FUNCTION public.get_default_admin_permissions() SET search_path = public;
ALTER FUNCTION public.update_ingredient_stock_on_purchase() SET search_path = public;
ALTER FUNCTION public.record_discount_usage_and_deactivate() SET search_path = public;
ALTER FUNCTION public.return_stock_on_cancellation() SET search_path = public;
ALTER FUNCTION public.get_product_stats_single() SET search_path = public;
ALTER FUNCTION public.get_customer_basic_stats(uuid) SET search_path = public;
ALTER FUNCTION public.validate_discount_target() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.get_default_staff_permissions() SET search_path = public;
ALTER FUNCTION public.delete_referral_level(uuid) SET search_path = public;
ALTER FUNCTION public.generate_personal_reward_code(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.get_customer_rewards_progress(uuid) SET search_path = public;
ALTER FUNCTION public.get_detailed_referral_info() SET search_path = public;
