-- Secure the public catalog reads used by the client menu.
-- This migration intentionally does not change special_prices because the
-- current client flow has no trustworthy Supabase Auth identity-to-customer
-- mapping. Special-price authorization must be handled separately.

alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.product_images enable row level security;

create policy "Public can read active menu products"
on public.products
as permissive
for select
to anon, authenticated
using (is_active = true);

create policy "Public can read menu categories"
on public.categories
as permissive
for select
to anon, authenticated
using (true);

create policy "Public can read active product images"
on public.product_images
as permissive
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products as p
    where p.id = product_images.product_id
      and p.is_active = true
  )
);
