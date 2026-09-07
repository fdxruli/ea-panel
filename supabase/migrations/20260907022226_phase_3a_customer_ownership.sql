-- FASE 3A: authenticated customer ownership.
-- Depends on FASE 3 (customers.auth_user_id + Auth identity functions).
-- Legacy anonymous policies remain intentionally available during transition.

create schema if not exists private;

create or replace function private.customer_id_for_auth()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.id from public.customers c
  where c.auth_user_id = (select auth.uid())
  limit 1
$$;

revoke all on function private.customer_id_for_auth() from public, anon;
grant execute on function private.customer_id_for_auth() to authenticated;

create or replace function public.require_my_customer_id()
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare v_customer_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select private.customer_id_for_auth() into v_customer_id;
  if v_customer_id is null then raise exception 'Authenticated user is not linked to a customer'; end if;
  return v_customer_id;
end;
$$;

revoke all on function public.require_my_customer_id() from public, anon;
grant execute on function public.require_my_customer_id() to authenticated;

-- Customers: authenticated ownership; anonymous legacy compatibility.
drop policy if exists "Customers can view their own profile" on public.customers;
drop policy if exists "Customers can insert profile" on public.customers;
drop policy if exists "Customers can update their own profile" on public.customers;

create policy "Legacy anonymous can view customers" on public.customers
  for select to anon using (true);
create policy "Authenticated customers can view own customer" on public.customers
  for select to authenticated using ((select auth.uid()) = auth_user_id);
create policy "Legacy anonymous can insert customers" on public.customers
  for insert to anon with check (true);
create policy "Authenticated customers can update own customer" on public.customers
  for update to authenticated
  using ((select auth.uid()) = auth_user_id)
  with check ((select auth.uid()) = auth_user_id);

-- System-controlled customer fields cannot be changed by a non-admin customer.
create or replace function public.prevent_customer_system_field_updates()
returns trigger
language plpgsql security invoker set search_path = public
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.auth_user_id is distinct from old.auth_user_id
       or new.referrer_id is distinct from old.referrer_id
       or new.referral_count is distinct from old.referral_count
       or new.referral_code is distinct from old.referral_code
       or new.has_made_first_purchase is distinct from old.has_made_first_purchase then
      raise exception 'Customer system-controlled fields cannot be modified by customers';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_customer_system_field_updates on public.customers;
create trigger trg_prevent_customer_system_field_updates
before update on public.customers
for each row execute function public.prevent_customer_system_field_updates();

revoke execute on function public.prevent_customer_system_field_updates() from public, anon, authenticated;

-- Orders / order_items.
drop policy if exists "Customers can insert their own orders" on public.orders;
drop policy if exists "Customers can view their own orders" on public.orders;
create policy "Legacy anonymous can view orders" on public.orders for select to anon using (true);
create policy "Authenticated customers can view own orders" on public.orders for select to authenticated
  using (exists (
    select 1 from public.customers c
    where c.id=orders.customer_id and c.auth_user_id=(select auth.uid())
  ));
create policy "Legacy anonymous can insert orders" on public.orders for insert to anon with check (true);

drop policy if exists "Customers can insert order items" on public.order_items;
drop policy if exists "Customers can view their own order items" on public.order_items;
create policy "Legacy anonymous can view order items" on public.order_items for select to anon using (true);
create policy "Authenticated customers can view own order items" on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o join public.customers c on c.id=o.customer_id
    where o.id=order_items.order_id and c.auth_user_id=(select auth.uid())
  ));
create policy "Legacy anonymous can insert order items" on public.order_items for insert to anon with check (true);

-- Addresses.
drop policy if exists "Customers can manage their addresses" on public.customer_addresses;
create policy "Legacy anonymous can manage addresses" on public.customer_addresses for all to anon using (true) with check (true);
create policy "Authenticated customers can read own addresses" on public.customer_addresses for select to authenticated
  using (exists (select 1 from public.customers c where c.id=customer_addresses.customer_id and c.auth_user_id=(select auth.uid())));
create policy "Authenticated customers can insert own addresses" on public.customer_addresses for insert to authenticated
  with check (exists (select 1 from public.customers c where c.id=customer_addresses.customer_id and c.auth_user_id=(select auth.uid())));
create policy "Authenticated customers can update own addresses" on public.customer_addresses for update to authenticated
  using (exists (select 1 from public.customers c where c.id=customer_addresses.customer_id and c.auth_user_id=(select auth.uid())))
  with check (exists (select 1 from public.customers c where c.id=customer_addresses.customer_id and c.auth_user_id=(select auth.uid())));
create policy "Authenticated customers can delete own addresses" on public.customer_addresses for delete to authenticated
  using (exists (select 1 from public.customers c where c.id=customer_addresses.customer_id and c.auth_user_id=(select auth.uid())));

-- Favorites.
drop policy if exists "Customers can manage their favorites" on public.customer_favorites;
create policy "Legacy anonymous can manage favorites" on public.customer_favorites for all to anon using (true) with check (true);
create policy "Authenticated customers can read own favorites" on public.customer_favorites for select to authenticated
  using (exists (select 1 from public.customers c where c.id=customer_favorites.customer_id and c.auth_user_id=(select auth.uid())));
create policy "Authenticated customers can insert own favorites" on public.customer_favorites for insert to authenticated
  with check (exists (select 1 from public.customers c where c.id=customer_favorites.customer_id and c.auth_user_id=(select auth.uid())));
create policy "Authenticated customers can update own favorites" on public.customer_favorites for update to authenticated
  using (exists (select 1 from public.customers c where c.id=customer_favorites.customer_id and c.auth_user_id=(select auth.uid())))
  with check (exists (select 1 from public.customers c where c.id=customer_favorites.customer_id and c.auth_user_id=(select auth.uid())));
create policy "Authenticated customers can delete own favorites" on public.customer_favorites for delete to authenticated
  using (exists (select 1 from public.customers c where c.id=customer_favorites.customer_id and c.auth_user_id=(select auth.uid())));

-- Direct customer access to special_prices is intentionally removed for authenticated users.
drop policy if exists "Public can read special prices" on public.special_prices;
create policy "Legacy anonymous can read special prices" on public.special_prices for select to anon using (true);

create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_customer_addresses_customer_id on public.customer_addresses(customer_id);
create index if not exists idx_customer_favorites_customer_id on public.customer_favorites(customer_id);

-- System-field hardening is kept in the same logical migration history:
-- customer-authenticated updates may change only customer-editable fields.
create or replace function public.prevent_customer_system_field_updates()
returns trigger language plpgsql security invoker set search_path=public
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.id is distinct from old.id
       or new.phone is distinct from old.phone
       or new.created_at is distinct from old.created_at
       or new.auth_user_id is distinct from old.auth_user_id
       or new.referrer_id is distinct from old.referrer_id
       or new.referral_count is distinct from old.referral_count
       or new.referral_code is distinct from old.referral_code
       or new.has_made_first_purchase is distinct from old.has_made_first_purchase then
      raise exception 'Customer system-controlled fields cannot be modified by customers';
    end if;
  end if;
  return new;
end;
$$;
