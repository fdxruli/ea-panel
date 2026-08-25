-- Fix array reconstruction in customer_merge: DISTINCT is applied in a subquery,
-- then the UUID array is deterministically ordered.
-- This migration intentionally does not change auth, RLS, Phone Auth, order_items, or order_profits.

create or replace function public.customer_merge(p_canonical_customer_id uuid, p_duplicate_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  a customers%rowtype;
  b customers%rowtype;
  audit_id bigint;
  push_a_exists boolean;
  push_b_exists boolean;
  cnt bigint;
  transferred jsonb := '{}'::jsonb;
  b_snapshot jsonb;
  b_referral_code text;
  third_customer_id uuid;
begin
  if p_canonical_customer_id is null or p_duplicate_customer_id is null then raise exception 'customer_merge requires non-null customer IDs'; end if;
  if p_canonical_customer_id = p_duplicate_customer_id then raise exception 'canonical and duplicate customers must differ'; end if;
  select * into a from customers where id = p_canonical_customer_id for update;
  if not found then raise exception 'canonical customer % does not exist', p_canonical_customer_id; end if;
  select * into b from customers where id = p_duplicate_customer_id for update;
  if not found then raise exception 'duplicate customer % does not exist', p_duplicate_customer_id; end if;
  if a.phone is null or b.phone is null or a.phone <> b.phone then raise exception 'customers must have the same non-null phone: A=% B=%', a.phone, b.phone; end if;
  select id into third_customer_id from customers where phone = a.phone and id not in (a.id,b.id) limit 1;
  if third_customer_id is not null then raise exception 'third customer % already uses phone %', third_customer_id, a.phone; end if;

  b_snapshot := to_jsonb(b);
  b_referral_code := b.referral_code;

  update customers set referrer_id = a.id where referrer_id = b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('referrals',cnt);
  update orders set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('orders',cnt);
  update customer_addresses set customer_id = a.id where customer_id = b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('addresses',cnt);

  delete from customer_terms_acceptances x using customer_terms_acceptances y where x.customer_id=b.id and y.customer_id=a.id and x.terms_version_id=y.terms_version_id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('duplicate_terms_removed',cnt);
  update customer_terms_acceptances set customer_id=a.id where customer_id=b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('terms_transferred',cnt);

  delete from customer_favorites x using customer_favorites y where x.customer_id=b.id and y.customer_id=a.id and x.product_id=y.product_id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('duplicate_favorites_removed',cnt);
  update customer_favorites set customer_id=a.id where customer_id=b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('favorites_transferred',cnt);

  update product_reviews set customer_id=a.id where customer_id=b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('reviews_transferred',cnt);
  update customer_discount_usage set customer_id=a.id where customer_id=b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('discount_usage_transferred',cnt);
  update customer_reward_claims set customer_id=a.id where customer_id=b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('reward_claims_transferred',cnt);
  update discounts set specific_customer_id=a.id where specific_customer_id=b.id;
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('specific_discounts_transferred',cnt);

  select exists(select 1 from push_subscriptions where customer_id=a.id) into push_a_exists;
  select exists(select 1 from push_subscriptions where customer_id=b.id) into push_b_exists;
  if push_a_exists and push_b_exists then raise exception 'push conflict: both A and B have subscriptions'; end if;
  if push_b_exists then update push_subscriptions set customer_id=a.id where customer_id=b.id; get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('push_transferred',cnt); end if;

  update special_prices sp
  set target_customer_ids=(select coalesce(array_agg(x.uuid_value order by x.uuid_value),'{}'::uuid[]) from (select distinct case when u=b.id then a.id else u end as uuid_value from unnest(sp.target_customer_ids) as t(u)) x)
  where b.id=any(sp.target_customer_ids);
  get diagnostics cnt = row_count; transferred := transferred || jsonb_build_object('special_prices_updated',cnt);

  insert into private.customer_merge_audit(canonical_customer_id,duplicate_customer_id,phone,duplicate_customer_snapshot,transferred_counts)
  values(a.id,b.id,a.phone,b_snapshot,transferred) returning id into audit_id;

  delete from customers where id=b.id;
  if not found then raise exception 'duplicate customer % could not be deleted',b.id; end if;

  if exists(select 1 from customers where phone=a.phone and id<>a.id) then raise exception 'post-merge phone uniqueness precondition failed for %',a.phone; end if;
  if exists(select 1 from customers where referrer_id=b.id) or exists(select 1 from customer_addresses where customer_id=b.id) or exists(select 1 from customer_discount_usage where customer_id=b.id) or exists(select 1 from customer_favorites where customer_id=b.id) or exists(select 1 from customer_reward_claims where customer_id=b.id) or exists(select 1 from customer_terms_acceptances where customer_id=b.id) or exists(select 1 from discounts where specific_customer_id=b.id) or exists(select 1 from orders where customer_id=b.id) or exists(select 1 from product_reviews where customer_id=b.id) or exists(select 1 from push_subscriptions where customer_id=b.id) then raise exception 'post-merge foreign-key reference to duplicate % remains',b.id; end if;
  if exists(select 1 from special_prices where b.id=any(target_customer_ids)) then raise exception 'post-merge special_prices reference to duplicate % remains',b.id; end if;

  return jsonb_build_object('audit_id',audit_id,'canonical_customer_id',a.id,'duplicate_customer_id',b.id,'phone',a.phone,'duplicate_referral_code',b_referral_code,'transferred',transferred);
end;
$$;

revoke all on function public.customer_merge(uuid,uuid) from public, anon, authenticated;
grant execute on function public.customer_merge(uuid,uuid) to service_role;
