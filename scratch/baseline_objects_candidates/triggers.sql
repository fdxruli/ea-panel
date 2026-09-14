-- TRIGGERS CANDIDATOS BASELINE

-- Tabla: orders
CREATE TRIGGER trigger_orders_updated_at 
BEFORE UPDATE ON public.orders 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_generate_order_code 
BEFORE INSERT ON public.orders 
FOR EACH ROW EXECUTE FUNCTION generate_order_code();

CREATE TRIGGER refresh_stats_trigger 
AFTER INSERT OR DELETE OR UPDATE ON public.orders 
FOR EACH STATEMENT EXECUTE FUNCTION refresh_dashboard_stats();

CREATE TRIGGER on_order_status_change 
AFTER UPDATE ON public.orders 
FOR EACH ROW EXECUTE FUNCTION send_order_notification_on_status_change();

CREATE TRIGGER handle_stock_return_on_cancel 
AFTER UPDATE ON public.orders 
FOR EACH ROW EXECUTE FUNCTION return_stock_on_cancellation();

CREATE TRIGGER trigger_first_purchase_referral 
AFTER INSERT OR UPDATE ON public.orders 
FOR EACH ROW EXECUTE FUNCTION handle_first_purchase_referral();

-- Tabla: discounts
CREATE TRIGGER trigger_validate_discount_target 
BEFORE INSERT OR UPDATE ON public.discounts 
FOR EACH ROW EXECUTE FUNCTION validate_discount_target();

-- Tabla: ingredient_purchases
CREATE TRIGGER on_ingredient_purchase_inserted 
AFTER INSERT ON public.ingredient_purchases 
FOR EACH ROW EXECUTE FUNCTION update_ingredient_stock_on_purchase();

