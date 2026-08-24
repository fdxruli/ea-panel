-- Customer identity consolidation: transactional merge + private audit trail.
-- This migration intentionally does not touch auth.users, RLS, Phone Auth, order_profits, or order_items.

create schema if not exists private;

create table if not exists private.customer_merge_audit (
  id bigint generated always as identity primary key,
  canonical_customer_id uuid not null,
  duplicate_customer_id uuid not null,
  phone text not null,
  duplicate_customer_snapshot jsonb not null,
  transferred_counts jsonb not null,
  created_at timestamptz not null default now(),
  check (canonical_customer_id <> duplicate_customer_id)
);

revoke all on table private.customer_merge_audit from public, anon, authenticated;

grant usage on schema private to service_role;
grant select, insert on table private.customer_merge_audit to service_role;

create or replace function public.customer_merge(
  p_canonical_customer_id uuid,
  p_duplicate_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  a customers%rowtype;
  b customers%rowtype;
  audit_id bigint;
  push_a record;
  cnt bigint;
  transferred jsonb := '{}'::jsonb;
  b_snapshot jsonb;
  b_referral_code text;
  existing_customer_id uuid;
begin
  if p_canonical_customer_id is null or p_duplicate_customer_id is null then
    raise exception 'customer_merge requires non-null customer IDs';
  end if;
  if p_canonical_customer_id = p_duplicate_customer_id then
    raise exception 'canonical and duplicate customers must differ';
  end if;

  select * into a from customers where id = p_canonical_customer_id for update;
  if not found then raise exception 'canonical customer % does not exist', p_canonical_customer_id; end if;
  select * into b from customers where id = p_duplicate_customer_id for update;
  if not found then raise exception 'duplicate customer % does not exist', p_duplicate_customer_id; end if;
  if a.phone is null or b.phone is null or a.phone <> b.phone then
    raise exception 'customers must have the same non-null phone: A=% B=%', a.phone, b.phone;
  end if;

  -- No other customer may already share this phone; this is a safety guard against a third identity.
  select id into existing_customer_id
  from customers
  where phone = a.phone and id not in (a.id, b.id)
  limit 1;
  if existing_customer_id is not null then
    raise exception 'third customer % already uses phone %', existing_customer_id, a.phone;
  end if;

  -- Preserve the complete duplicate row before deletion, including its historical referral code.
  b_snapshot := to_jsonb(b);
  b_referral_code := b.referral_code;

  -- A duplicate referral code is historical data. It is retained in the audit snapshot rather than
  -- moved onto A, because referral_code is UNIQUE and A remains the canonical identity.
  if b_referral_code is not null and b_referral_code <> a.referral_code then
    null;
  end if;

  -- Referral children must follow the canonical identity.
  update customers set referrer_id = a.id where referrer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('referrals', cnt);

  -- Orders: mandatory before deleting B because FK is RESTRICT.
  update orders set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('orders', cnt);

  -- Addresses: preserve all rows. No proximity-based or heuristic deduplication is performed.
  update customer_addresses set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('addresses', cnt);

  -- Terms: deduplicate only where the exact customer/version relationship already exists on A.
  delete from customer_terms_acceptances x
  using customer_terms_acceptances y
  where x.customer_id = b.id
    and y.customer_id = a.id
    and x.terms_version_id = y.terms_version_id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('duplicate_terms_removed', cnt);
  update customer_terms_acceptances set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('terms_transferred', cnt);

  -- Favorites: remove exact A/resource collisions, then transfer the remainder.
  delete from customer_favorites x
  using customer_favorites y
  where x.customer_id = b.id
    and y.customer_id = a.id
    and x.product_id = y.product_id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('duplicate_favorites_removed', cnt);
  update customer_favorites set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('favorites_transferred', cnt);

  -- Reviews are legitimate history. Do not silently discard B reviews; if an exact UNIQUE collision
  -- exists the database will abort the whole transaction rather than losing a review.
  update product_reviews set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('reviews_transferred', cnt);

  -- Discount usage/reward claims: transfer only after exact duplicate relationships are removed.
  -- We use the table's actual UNIQUE constraints as the final arbiter; unexpected collisions abort.
  update customer_discount_usage set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('discount_usage_transferred', cnt);

  update customer_reward_claims set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('reward_claims_transferred', cnt);

  -- Discounts referencing a specific customer are direct FK references.
  update discounts set specific_customer_id = a.id where specific_customer_id = b.id;
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('specific_discounts_transferred', cnt);

  -- Push: there is a UNIQUE customer_id constraint. Never delete B's subscription to solve a conflict.
  select * into push_a from push_subscriptions where customer_id = a.id limit 1;
  if push_a is not null then
    if exists (select 1 from push_subscriptions where customer_id = b.id) then
      raise exception 'push conflict: both A and B have subscriptions';
    end if;
  else
    update push_subscriptions set customer_id = a.id where customer_id = b.id;
    get diagnostics cnt = row_count;
    transferred := transferred || jsonb_build_object('push_transferred', cnt);
  end if;

  -- Logical UUID references in special_prices. Replace B with A and remove duplicate A entries.
  update special_prices
  set target_customer_ids = (
    select coalesce(array_agg(distinct case when u = b.id then a.id else u end order by case when u = b.id then a.id else u end), '{}'::uuid[])
    from unnest(target_customer_ids) u
  )
  where b.id = any(target_customer_ids);
  get diagnostics cnt = row_count;
  transferred := transferred || jsonb_build_object('special_prices_updated', cnt);

  -- Persist audit evidence before deleting B. This is part of the same transaction.
  insert into private.customer_merge_audit (
    canonical_customer_id,
    duplicate_customer_id,
    phone,
    duplicate_customer_snapshot,
    transferred_counts
  ) values (a.id, b.id, a.phone, b_snapshot, transferred)
  returning id into audit_id;

  delete from customers where id = b.id;
  if not found then
    raise exception 'duplicate customer % could not be deleted', b.id;
  end if;

  if exists (select 1 from customers where phone = a.phone and id <> a.id) then
    raise exception 'post-merge phone uniqueness precondition failed for %', a.phone;
  end if;
  if exists (select 1 from customers where referrer_id = b.id)
     or exists (select 1 from customer_addresses where customer_id = b.id)
     or exists (select 1 from customer_discount_usage where customer_id = b.id)
     or exists (select 1 from customer_favorites where customer_id = b.id)
     or exists (select 1 from customer_reward_claims where customer_id = b.id)
     or exists (select 1 from customer_terms_acceptances where customer_id = b.id)
     or exists (select 1 from discounts where specific_customer_id = b.id)
     or exists (select 1 from orders where customer_id = b.id)
     or exists (select 1 from product_reviews where customer_id = b.id)
     or exists (select 1 from push_subscriptions where customer_id = b.id)
  then raise exception 'post-merge foreign-key reference to duplicate % remains', b.id;
  end if;
  if exists (select 1 from special_prices where b.id = any(target_customer_ids)) then
    raise exception 'post-merge special_prices reference to duplicate % remains', b.id;
  end if;

  return jsonb_build_object(
    'audit_id', audit_id,
    'canonical_customer_id', a.id,
    'duplicate_customer_id', b.id,
    'phone', a.phone,
    'duplicate_referral_code', b_referral_code,
    'transferred', transferred
  );
end;
$$;

revoke all on function public.customer_merge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.customer_merge(uuid, uuid) to service_role;
