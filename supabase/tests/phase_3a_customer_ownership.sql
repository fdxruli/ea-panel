-- FASE 3A RLS tests (pgTAP).
-- These tests require the Supabase test runner/pgTAP locally.
-- Production verification for this phase was executed with rollback-only SQL probes.

begin;

select plan(12);

-- The exact customer fixtures and Auth users should be provided by the test
-- harness. Never insert or mutate production customer identities in this file.

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='customers' and c.relrowsecurity
  ),
  'customers has RLS enabled'
);

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='orders' and c.relrowsecurity
  ),
  'orders has RLS enabled'
);

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='order_items' and c.relrowsecurity
  ),
  'order_items has RLS enabled'
);

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='customer_addresses' and c.relrowsecurity
  ),
  'customer_addresses has RLS enabled'
);

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='customer_favorites' and c.relrowsecurity
  ),
  'customer_favorites has RLS enabled'
);

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='special_prices' and c.relrowsecurity
  ),
  'special_prices has RLS enabled'
);

select ok(
  has_function_privilege('authenticated','public.get_my_customer_id()','execute'),
  'authenticated can resolve its customer identity'
);

select ok(
  not has_function_privilege('anon','public.get_my_customer_stats()','execute'),
  'anon cannot call the new customer stats route'
);

select ok(
  not has_function_privilege('anon','public.get_customer_stats_batch(uuid[])','execute'),
  'anon cannot call customer stats batch'
);

select ok(
  has_function_privilege('authenticated','public.get_my_customer_basic_stats()','execute'),
  'authenticated can call ownership-safe stats'
);

select ok(
  has_function_privilege('authenticated','public.get_my_active_menu_products()','execute'),
  'authenticated can call ownership-safe menu'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='customers'
      and indexdef ilike '%auth_user_id%'
  ),
  'customers auth_user_id is indexed'
);

select * from finish();
rollback;
