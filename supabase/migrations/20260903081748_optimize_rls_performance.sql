-- ==============================================================================
-- OPTIMIZACIÓN DE RENDIMIENTO RLS (auth_rls_initplan)
-- Envolver auth.uid() en (select auth.uid()) para forzar cacheo durante RLS
-- ==============================================================================

-- 1. Optimizar función is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM admins WHERE id = (select auth.uid()));
$function$;

-- 2. Optimizar políticas RLS de tablas
ALTER POLICY "Customers can manage their addresses" ON public.customer_addresses 
  USING (((select auth.uid()) = customer_id));

ALTER POLICY "Customers can view their discount usage" ON public.customer_discount_usage 
  USING (((select auth.uid()) = customer_id));

ALTER POLICY "Customers can manage their favorites" ON public.customer_favorites 
  USING (((select auth.uid()) = customer_id));

ALTER POLICY "Customers can view their reward claims" ON public.customer_reward_claims 
  USING (((select auth.uid()) = customer_id));

ALTER POLICY "Customers can view terms acceptances" ON public.customer_terms_acceptances 
  USING (((select auth.uid()) = customer_id));
ALTER POLICY "Customers can insert terms acceptances" ON public.customer_terms_acceptances 
  WITH CHECK (((select auth.uid()) = customer_id));

ALTER POLICY "Customers can view their own profile" ON public.customers 
  USING (((select auth.uid()) = id));
ALTER POLICY "Customers can update their own profile" ON public.customers 
  USING (((select auth.uid()) = id));

ALTER POLICY "Customers can read active discounts" ON public.discounts 
  USING ((is_active = true) AND ((specific_customer_id IS NULL) OR (specific_customer_id = (select auth.uid()))));

ALTER POLICY "Customers can view their own order items" ON public.order_items 
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = (select auth.uid())));

ALTER POLICY "Customers can view their own orders" ON public.orders 
  USING (((select auth.uid()) = customer_id));
ALTER POLICY "Customers can insert their own orders" ON public.orders 
  WITH CHECK (((select auth.uid()) = customer_id));

ALTER POLICY "Customers can manage their reviews" ON public.product_reviews 
  USING (((select auth.uid()) = customer_id));
ALTER POLICY "Customers can update their reviews" ON public.product_reviews 
  USING (((select auth.uid()) = customer_id));
ALTER POLICY "Customers can insert their reviews" ON public.product_reviews 
  WITH CHECK (((select auth.uid()) = customer_id));

ALTER POLICY "Customers can manage their push subscriptions" ON public.push_subscriptions 
  USING (((select auth.uid()) = customer_id));
