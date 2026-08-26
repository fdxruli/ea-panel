-- Admin catalog must be able to manage inactive products.
-- Public/anonymous clients remain restricted to active products.
create policy "Admins can read all products"
on public.products
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from public.admins as a
    where a.id = (select auth.uid())
  )
);
