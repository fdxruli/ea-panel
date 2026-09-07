-- FASE 4 — Public/global pricing for signed-out or Auth-unlinked browsing.
-- This function is SECURITY INVOKER and is additionally constrained by RLS
-- to rows that have no customer targeting.

revoke insert,update,delete,truncate,references,trigger on public.special_prices from anon,authenticated;
grant select on public.special_prices to anon,authenticated;

alter table public.special_prices enable row level security;

drop policy if exists special_prices_public_read on public.special_prices;
create policy special_prices_public_read
on public.special_prices
for select
 to anon,authenticated
using (target_customer_ids is null or cardinality(target_customer_ids)=0);

create or replace function public.get_public_special_prices()
returns table(
  id uuid, product_id uuid, category_id uuid, override_price numeric,
  start_date date, end_date date, reason text,
  product_name varchar, category_name varchar, is_active boolean
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select
    sp.id,sp.product_id,sp.category_id,sp.override_price,sp.start_date,sp.end_date,sp.reason,
    p.name,c.name,true
  from public.special_prices sp
  left join public.products p on p.id=sp.product_id
  left join public.categories c on c.id=sp.category_id
  where current_date between sp.start_date and sp.end_date
    and (sp.target_customer_ids is null or cardinality(sp.target_customer_ids)=0)
$$;

revoke execute on function public.get_public_special_prices() from public;
grant execute on function public.get_public_special_prices() to anon,authenticated;

revoke execute on function public.get_my_special_prices() from public,anon;
grant execute on function public.get_my_special_prices() to authenticated;
