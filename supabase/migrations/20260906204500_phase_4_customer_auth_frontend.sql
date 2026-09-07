-- FASE 4 — Customer frontend Auth migration
-- Auth becomes the identity source for customer-facing operations.
-- No Loyalty rules are changed here.

create or replace function public.get_active_menu_products(p_customer_id uuid default null)
returns table(
  id uuid, name varchar, description text, price numeric, image_url text, category_id uuid,
  is_active boolean, track_stock boolean, created_at timestamptz, is_out_of_stock boolean,
  product_images json, is_exclusive boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer_id uuid := p_customer_id;
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    select c.id into v_customer_id
    from public.customers c
    where c.auth_user_id = (select auth.uid())
    limit 1;

    if p_customer_id is not null and p_customer_id is distinct from v_customer_id then
      raise exception 'Customer ownership mismatch';
    end if;
  end if;

  return query
  select
    p.id,p.name,p.description,p.price,p.image_url,p.category_id,p.is_active,p.track_stock,p.created_at,
    case when p.track_stock=true and exists (
      select 1
      from public.product_recipes rec
      join public.ingredients ing on rec.ingredient_id=ing.id
      where rec.product_id=p.id
        and rec.deduct_stock_automatically=true
        and ing.track_inventory=true
        and (ing.current_stock<rec.quantity_used or ing.current_stock<=0)
    ) then true else false end,
    coalesce((
      select json_agg(json_build_object('id',pi.id,'image_url',pi.image_url))
      from public.product_images pi where pi.product_id=p.id
    ),'[]'::json),
    (p.target_customer_ids is not null and array_length(p.target_customer_ids,1)>0)
  from public.products p
  where p.is_active=true
    and (
      p.target_customer_ids is null
      or array_length(p.target_customer_ids,1) is null
      or (v_customer_id is not null and v_customer_id=any(p.target_customer_ids))
    )
  order by p.name asc;
end;
$$;

create or replace function public.complete_my_customer_registration(
  p_name text,
  p_referrer_code text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_phone text;
  v_confirmed timestamptz;
  v_existing uuid;
  v_referrer uuid;
  v_code text;
  v_base_code text;
  v_customer uuid;
  v_counter integer := 1;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='P0001';
  end if;

  select u.phone,u.phone_confirmed_at into v_phone,v_confirmed
  from auth.users u where u.id=v_uid;

  if v_phone is null or btrim(v_phone)='' then
    raise exception 'authenticated_phone_missing' using errcode='P0001';
  end if;
  if v_confirmed is null then
    raise exception 'phone_not_verified' using errcode='P0001';
  end if;

  select c.id into v_existing from public.customers c where c.phone=v_phone limit 1;
  if v_existing is not null then
    if exists(
      select 1 from public.customers c
      where c.auth_user_id=v_uid and c.id<>v_existing
    ) then
      raise exception 'auth_user_already_linked_to_different_customer' using errcode='P0001';
    end if;
    update public.customers
      set auth_user_id=v_uid
      where id=v_existing and auth_user_id is null;
    return v_existing;
  end if;

  if p_referrer_code is not null and btrim(p_referrer_code)<>'' then
    select id into v_referrer
    from public.customers
    where upper(referral_code)=upper(btrim(p_referrer_code))
    limit 1;
  end if;

  -- Preserve the existing referral-code behavior for newly created customers.
  v_base_code := 'EA-' ||
    upper(substr(regexp_replace(btrim(coalesce(p_name,'')),'[^[:alnum:]]','','g'),1,2)) ||
    right(regexp_replace(v_phone,'[^0-9]','','g'),2);
  if length(v_base_code)<6 then
    v_base_code := 'EA-CL' || right(regexp_replace(v_phone,'[^0-9]','','g'),2);
  end if;
  v_code := v_base_code;
  while exists(select 1 from public.customers c where c.referral_code=v_code) loop
    v_counter := v_counter + 1;
    v_code := v_base_code || '-' || v_counter;
  end loop;

  insert into public.customers(
    name,phone,referral_code,referrer_id,referral_count,has_made_first_purchase,auth_user_id
  ) values (
    btrim(p_name),v_phone,v_code,v_referrer,0,false,v_uid
  ) returning id into v_customer;

  return v_customer;
exception when unique_violation then
  raise exception 'customer_registration_conflict' using errcode='P0001';
end;
$$;

revoke execute on function public.complete_my_customer_registration(text,text) from public,anon;
grant execute on function public.complete_my_customer_registration(text,text) to authenticated;

create or replace function public.get_my_special_prices()
returns table(
  id uuid, product_id uuid, category_id uuid, override_price numeric,
  start_date date, end_date date, reason text, target_customer_ids uuid[],
  product_name varchar, category_name varchar, is_active boolean
)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_customer_id uuid := null;
begin
  if (select auth.uid()) is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.auth_user_id=(select auth.uid())
    limit 1;
  end if;

  return query
  select
    sp.id,sp.product_id,sp.category_id,sp.override_price,sp.start_date,sp.end_date,
    sp.reason,sp.target_customer_ids,p.name,c.name,true
  from public.special_prices sp
  left join public.products p on p.id=sp.product_id
  left join public.categories c on c.id=sp.category_id
  where current_date between sp.start_date and sp.end_date
    and (
      sp.target_customer_ids is null
      or cardinality(sp.target_customer_ids)=0
      or (v_customer_id is not null and v_customer_id=any(sp.target_customer_ids))
    );
end;
$$;

revoke execute on function public.get_my_special_prices() from public;
grant execute on function public.get_my_special_prices() to anon,authenticated;

-- The customer-facing frontend now uses Auth-safe variants. Keep legacy RPCs
-- available for internal/admin compatibility; authenticated ownership remains
-- enforced by the Auth-safe variants used by the frontend.
