create or replace function public.get_my_loyalty_category()
returns table (
  category text,
  total_spent numeric,
  completed_orders bigint,
  last_order_date timestamptz
)
language sql
stable
security invoker
as $$
  with my_customer as (
    select c.id
    from public.customers c
    where c.auth_user_id = (select auth.uid())
  ),
  stats as (
    select
      coalesce(sum(o.total_amount), 0) as total_spent,
      count(o.id) as completed_orders,
      max(o.created_at) as last_order_date
    from my_customer mc
    left join public.orders o
      on o.customer_id = mc.id
     and o.status = 'completado'::public.order_status
  )
  select
    case
      when (s.total_spent >= 3000 or s.completed_orders >= 15)
       and s.last_order_date >= now() - interval '90 days'
        then 'vip'
      when (s.total_spent >= 750 or s.completed_orders >= 3)
       and s.last_order_date >= now() - interval '90 days'
        then 'frecuente'
      else 'inicial'
    end as category,
    s.total_spent,
    s.completed_orders,
    s.last_order_date
  from stats s;
$$;

revoke execute on function public.get_my_loyalty_category() from public;
revoke execute on function public.get_my_loyalty_category() from anon;
grant execute on function public.get_my_loyalty_category() to authenticated;
