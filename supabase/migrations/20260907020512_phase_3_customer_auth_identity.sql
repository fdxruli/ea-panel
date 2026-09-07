-- FASE 3: Customer Auth Identity
-- Additive only. Does not replace customers.id or any existing domain FKs.

alter table public.customers
  add column if not exists auth_user_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customers_auth_user_id_fkey'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customers_auth_user_id_key'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_auth_user_id_key unique (auth_user_id);
  end if;
end $$;

comment on column public.customers.auth_user_id is
  'Optional Supabase Auth identity for this domain customer. customers.id remains the domain identity.';

create or replace function public.get_my_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select c.id
  from public.customers c
  where (select auth.uid()) is not null
    and c.auth_user_id = (select auth.uid())
  limit 1;
$function$;

comment on function public.get_my_customer_id() is
  'Resolves the current authenticated Supabase Auth user to customers.id. Never accepts a customer_id argument.';

revoke all on function public.get_my_customer_id() from public;
revoke all on function public.get_my_customer_id() from anon;
grant execute on function public.get_my_customer_id() to authenticated;
grant execute on function public.get_my_customer_id() to service_role;

create or replace function public.link_my_customer()
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth_uid uuid := (select auth.uid());
  v_phone text;
  v_phone_confirmed_at timestamptz;
  v_customer_id uuid;
  v_customer_auth_user_id uuid;
  v_match_count integer;
begin
  if v_auth_uid is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;

  select u.phone, u.phone_confirmed_at
    into v_phone, v_phone_confirmed_at
  from auth.users u
  where u.id = v_auth_uid;

  if not found then
    raise exception 'auth_user_not_found' using errcode = 'P0001';
  end if;

  if v_phone is null or btrim(v_phone) = '' then
    raise exception 'authenticated_phone_missing' using errcode = 'P0001';
  end if;

  if v_phone_confirmed_at is null then
    raise exception 'phone_not_verified' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_match_count
  from public.customers c
  where c.phone = v_phone;

  if v_match_count = 0 then
    raise exception 'customer_not_found_for_verified_phone' using errcode = 'P0001';
  end if;

  if v_match_count > 1 then
    raise exception 'customer_phone_ambiguous' using errcode = 'P0001';
  end if;

  select c.id, c.auth_user_id
    into v_customer_id, v_customer_auth_user_id
  from public.customers c
  where c.phone = v_phone
  for update;

  if v_customer_auth_user_id is not null
     and v_customer_auth_user_id <> v_auth_uid then
    raise exception 'customer_already_linked_to_different_auth_user' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.customers c
    where c.auth_user_id = v_auth_uid
      and c.id <> v_customer_id
  ) then
    raise exception 'auth_user_already_linked_to_different_customer' using errcode = 'P0001';
  end if;

  if v_customer_auth_user_id = v_auth_uid then
    return v_customer_id;
  end if;

  update public.customers
     set auth_user_id = v_auth_uid
   where id = v_customer_id
     and auth_user_id is null;

  if not found then
    raise exception 'customer_link_race_or_conflict' using errcode = 'P0001';
  end if;

  return v_customer_id;
exception
  when unique_violation then
    raise exception 'auth_user_or_customer_link_conflict' using errcode = 'P0001';
end;
$function$;

comment on function public.link_my_customer() is
  'Links auth.uid() to the existing customer identified by the verified Auth phone. Never accepts customer_id. Blocks missing, ambiguous, or conflicting matches.';

revoke all on function public.link_my_customer() from public;
revoke all on function public.link_my_customer() from anon;
grant execute on function public.link_my_customer() to authenticated;
grant execute on function public.link_my_customer() to service_role;
