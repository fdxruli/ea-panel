-- FASE 3A hardening: authenticated ownership for customer-facing RPCs.
-- Parameterized RPCs remain callable for legacy/admin compatibility, but an
-- authenticated non-admin caller must match auth.uid() -> customers.auth_user_id.

create or replace function public.get_customer_basic_stats(p_customer_id uuid)
returns table(total_orders bigint, completed_orders bigint, total_spent numeric)
language plpgsql security definer set search_path=public
as $$
declare v_customer_id uuid:=p_customer_id;
begin
 if (select auth.uid()) is not null and not public.is_admin() then
   v_customer_id:=public.require_my_customer_id();
   if p_customer_id is distinct from v_customer_id then raise exception 'Customer ownership mismatch'; end if;
 end if;
 return query
 select (select count(*)::bigint from public.orders where customer_id=v_customer_id),
        (select count(*)::bigint from public.orders where customer_id=v_customer_id and status='completado'),
        (select coalesce(sum(total_amount),0) from public.orders where customer_id=v_customer_id and status='completado');
end;
$$;

create or replace function public.get_my_customer_basic_stats()
returns table(total_orders bigint, completed_orders bigint, total_spent numeric)
language sql stable security definer set search_path=public
as $$ select * from public.get_customer_basic_stats(public.require_my_customer_id()); $$;

create or replace function public.get_customer_favorite_products(p_customer_id uuid,p_limit integer default 5)
returns table(product_id uuid,product_name text,total_qty bigint,total_spent numeric,last_ordered_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_customer_id uuid:=p_customer_id;
begin
 if (select auth.uid()) is not null and not public.is_admin() then
   v_customer_id:=public.require_my_customer_id();
   if p_customer_id is distinct from v_customer_id then raise exception 'Customer ownership mismatch'; end if;
 end if;
 return query
 select oi.product_id,coalesce(p.name,'Producto')::text,sum(oi.quantity)::bigint,
        sum(oi.price*oi.quantity)::numeric,max(o.created_at)
 from public.order_items oi join public.orders o on o.id=oi.order_id
 left join public.products p on p.id=oi.product_id
 where o.customer_id=v_customer_id and o.status='completado'
 group by oi.product_id,p.name order by sum(oi.quantity) desc,sum(oi.price*oi.quantity) desc
 limit p_limit;
end;
$$;

create or replace function public.get_my_customer_favorite_products(p_limit integer default 5)
returns table(product_id uuid,product_name text,total_qty bigint,total_spent numeric,last_ordered_at timestamptz)
language sql stable security definer set search_path=public,pg_temp
as $$ select * from public.get_customer_favorite_products(public.require_my_customer_id(),p_limit); $$;

create or replace function public.get_customer_rewards_progress(p_customer_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_customer_id uuid:=p_customer_id; referral_c integer; current_l record; next_l record; unlocked_r jsonb; upcoming_r jsonb; claimed_r jsonb;
begin
 if (select auth.uid()) is not null and not public.is_admin() then
   v_customer_id:=public.require_my_customer_id();
   if p_customer_id is distinct from v_customer_id then raise exception 'Customer ownership mismatch'; end if;
 end if;
 select coalesce(referral_count,0) into referral_c from public.customers where id=v_customer_id;
 select * into current_l from public.referral_levels where min_referrals<=referral_c order by min_referrals desc limit 1;
 select * into next_l from public.referral_levels where min_referrals>referral_c order by min_referrals asc limit 1;
 select jsonb_agg(jsonb_build_object('id',r.id,'level_id',r.level_id,'level_name',l.name,'min_referrals',l.min_referrals,'title',coalesce(r.title,r.description),'description',r.description,'type',r.type) order by l.min_referrals,r.created_at)
 into unlocked_r from public.rewards r join public.referral_levels l on r.level_id=l.id where l.min_referrals<=referral_c;
 select jsonb_agg(jsonb_build_object('id',r.id,'level_id',r.level_id,'level_name',next_l.name,'min_referrals',next_l.min_referrals,'title',coalesce(r.title,r.description),'description',r.description,'type',r.type) order by r.created_at)
 into upcoming_r from public.rewards r where next_l.id is not null and r.level_id=next_l.id;
 select jsonb_agg(jsonb_build_object('reward_id',crc.reward_id,'level_id',r.level_id,'title',coalesce(r.title,r.description),'generated_code',crc.generated_code,'claimed_at',crc.claimed_at))
 into claimed_r from public.customer_reward_claims crc join public.rewards r on r.id=crc.reward_id where crc.customer_id=v_customer_id;
 return jsonb_build_object('referral_count',referral_c,'current_level',to_jsonb(current_l),'next_level',to_jsonb(next_l),'unlocked_rewards',coalesce(unlocked_r,'[]'::jsonb),'upcoming_rewards',coalesce(upcoming_r,'[]'::jsonb),'claimed_rewards',coalesce(claimed_r,'[]'::jsonb));
end;
$$;

create or replace function public.get_my_customer_rewards_progress()
returns jsonb language sql stable security definer set search_path=public
as $$ select public.get_customer_rewards_progress(public.require_my_customer_id()); $$;

create or replace function public.generate_personal_reward_code(p_customer_id uuid,p_reward_id uuid)
returns text language plpgsql security definer set search_path=public
as $$
declare v_customer_id uuid:=p_customer_id; reward_info record; original_discount record; new_code text; base_code text; customer_name_part text; v_referral_count integer;
begin
 if (select auth.uid()) is not null and not public.is_admin() then v_customer_id:=public.require_my_customer_id(); if p_customer_id is distinct from v_customer_id then raise exception 'Customer ownership mismatch'; end if; end if;
 if exists(select 1 from public.customer_reward_claims where customer_id=v_customer_id and reward_id=p_reward_id) then raise exception 'El cliente ya ha reclamado esta recompensa.'; end if;
 select r.description,r.reward_code,r.level_id,l.min_referrals into reward_info from public.rewards r join public.referral_levels l on r.level_id=l.id where r.id=p_reward_id;
 if not found then raise exception 'La recompensa especificada no fue encontrada.'; end if;
 if exists(select 1 from public.customer_reward_claims crc join public.rewards r on r.id=crc.reward_id where crc.customer_id=v_customer_id and r.level_id=reward_info.level_id) then raise exception 'Ya has elegido una recompensa para este nivel. Solo se permite una por nivel.'; end if;
 select coalesce(referral_count,0),substring(upper(coalesce(name,'CLIE')) from 1 for 4) into v_referral_count,customer_name_part from public.customers where id=v_customer_id;
 if not found then raise exception 'Cliente no encontrado.'; end if;
 if v_referral_count<reward_info.min_referrals then raise exception 'Referidos insuficientes (% de % requeridos) para reclamar esta recompensa.',v_referral_count,reward_info.min_referrals; end if;
 select type,value,target_id into original_discount from public.discounts where code=reward_info.reward_code;
 if not found then raise exception 'El código de descuento base "%" no fue encontrado.',reward_info.reward_code; end if;
 base_code:='EA-'||customer_name_part||'-'||reward_info.reward_code; new_code:=base_code;
 while exists(select 1 from public.discounts where code=new_code) loop new_code:=base_code||'-'||lpad((random()*100)::int::text,2,'0'); end loop;
 insert into public.discounts(code,type,value,target_id,is_active,is_single_use,specific_customer_id) values(new_code,original_discount.type,original_discount.value,original_discount.target_id,true,true,v_customer_id);
 insert into public.customer_reward_claims(customer_id,reward_id,generated_code) values(v_customer_id,p_reward_id,new_code);
 return new_code;
end;
$$;

create or replace function public.generate_my_personal_reward_code(p_reward_id uuid)
returns text language sql security definer set search_path=public
as $$ select public.generate_personal_reward_code(public.require_my_customer_id(),p_reward_id); $$;

create or replace function public.get_customer_stats_batch(p_customer_ids uuid[])
returns table(customer_id uuid,total_orders bigint,completed_orders bigint,total_spent numeric)
language plpgsql stable security definer set search_path=public,pg_temp
as $$
begin
 if (select auth.uid()) is not null and not public.is_admin() then raise exception 'Admin access required'; end if;
 return query
 select c.id,count(o.id)::bigint,count(o.id) filter(where o.status='completado')::bigint,coalesce(sum(o.total_amount) filter(where o.status='completado'),0)::numeric
 from unnest(p_customer_ids) c(id) left join public.orders o on o.customer_id=c.id group by c.id;
end;
$$;

create or replace function public.get_active_menu_products(p_customer_id uuid default null)
returns table(id uuid,name varchar,description text,price numeric,image_url text,category_id uuid,is_active boolean,track_stock boolean,created_at timestamptz,is_out_of_stock boolean,product_images json,is_exclusive boolean)
language plpgsql security definer set search_path=public
as $$
declare v_customer_id uuid:=p_customer_id;
begin
 if (select auth.uid()) is not null and not public.is_admin() then
   v_customer_id:=public.require_my_customer_id();
   if p_customer_id is not null and p_customer_id is distinct from v_customer_id then raise exception 'Customer ownership mismatch'; end if;
 end if;
 return query
 select p.id,p.name,p.description,p.price,p.image_url,p.category_id,p.is_active,p.track_stock,p.created_at,
 case when p.track_stock=true and exists(select 1 from public.product_recipes rec join public.ingredients ing on rec.ingredient_id=ing.id where rec.product_id=p.id and rec.deduct_stock_automatically=true and ing.track_inventory=true and (ing.current_stock<rec.quantity_used or ing.current_stock<=0)) then true else false end,
 coalesce((select json_agg(json_build_object('id',pi.id,'image_url',pi.image_url)) from public.product_images pi where pi.product_id=p.id),'[]'::json),
 (p.target_customer_ids is not null and array_length(p.target_customer_ids,1)>0)
 from public.products p
 where p.is_active=true and (p.target_customer_ids is null or array_length(p.target_customer_ids,1) is null or (v_customer_id is not null and v_customer_id=any(p.target_customer_ids))
 ) order by p.name;
end;
$$;

create or replace function public.get_my_active_menu_products()
returns table(id uuid,name varchar,description text,price numeric,image_url text,category_id uuid,is_active boolean,track_stock boolean,created_at timestamptz,is_out_of_stock boolean,product_images json,is_exclusive boolean)
language sql stable security definer set search_path=public
as $$ select * from public.get_active_menu_products(public.require_my_customer_id()); $$;

create or replace function public.record_discount_usage_and_deactivate(p_customer_id uuid,p_discount_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_customer_id uuid:=p_customer_id; discount_info record;
begin
 if (select auth.uid()) is not null and not public.is_admin() then v_customer_id:=public.require_my_customer_id(); if p_customer_id is distinct from v_customer_id then raise exception 'Customer ownership mismatch'; end if; end if;
 select is_single_use,specific_customer_id,requires_referred_status into discount_info from public.discounts where id=p_discount_id;
 if not found then return; end if;
 if discount_info.specific_customer_id is not null and discount_info.specific_customer_id is distinct from v_customer_id then raise exception 'Discount does not belong to this customer'; end if;
 insert into public.customer_discount_usage(customer_id,discount_id) values(v_customer_id,p_discount_id) on conflict do nothing;
 if discount_info.is_single_use and discount_info.specific_customer_id is not null then update public.discounts set is_active=false where id=p_discount_id; end if;
end;
$$;

create or replace function public.record_my_discount_usage_and_deactivate(p_discount_id uuid)
returns void language sql security definer set search_path=public
as $$ select public.record_discount_usage_and_deactivate(public.require_my_customer_id(),p_discount_id); $$;

-- The order implementation remains single-source; the authenticated path is
-- forced to the linked customer while admin/legacy paths remain compatible.
-- create_my_order_with_stock_check is the new ownership-safe public entrypoint.
create or replace function public.create_my_order_with_stock_check(p_total_amount numeric,p_scheduled_for timestamptz,p_cart_items public.cart_item[],p_notes varchar default null)
returns table(order_id uuid,order_code varchar,order_status public.order_status)
language sql security definer set search_path=public,pg_temp
as $$ select * from public.create_order_with_stock_check(public.require_my_customer_id(),p_total_amount,p_scheduled_for,p_cart_items,p_notes); $$;

-- Harden the existing order RPC without duplicating its stock implementation.
-- It must be replaced by the existing production implementation plus this guard
-- in the next generated migration if the repository branch does not already carry
-- the Phase 3A order implementation.

create or replace function public.create_order_with_stock_check(p_customer_id uuid,p_total_amount numeric,p_scheduled_for timestamptz,p_cart_items public.cart_item[],p_notes varchar default null)
returns table(order_id uuid,order_code varchar,order_status public.order_status)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_customer_id uuid:=p_customer_id; v_new_order_id uuid; v_new_order_code varchar; v_order_status public.order_status; cart_item public.cart_item; req_ingredient record;
begin
 if (select auth.uid()) is not null and not public.is_admin() then
   v_customer_id:=public.require_my_customer_id();
   if p_customer_id is distinct from v_customer_id then raise exception 'Customer ownership mismatch'; end if;
 end if;
 if array_length(p_cart_items,1) is null then raise exception 'El carrito est vacío'; end if;
 for req_ingredient in with cart_expanded as(select ci.product_id,ci.quantity from unnest(p_cart_items) ci), needed_per_ingredient as(select rec.ingredient_id,sum(ci.quantity*rec.quantity_used) total_deduction from cart_expanded ci join public.products prod on ci.product_id=prod.id join public.product_recipes rec on ci.product_id=rec.product_id group by rec.ingredient_id) select npi.ingredient_id,npi.total_deduction,ing.current_stock,ing.name ingredient_name,ing.min_stock from needed_per_ingredient npi join public.ingredients ing on npi.ingredient_id=ing.id order by ing.id for update of ing loop
  if req_ingredient.current_stock<req_ingredient.total_deduction then raise exception 'Stock insuficiente para "%". Se necesitan % piezas en total para cubrir tu pedido, pero solo quedan % piezas.',req_ingredient.ingredient_name,req_ingredient.total_deduction,req_ingredient.current_stock; end if;
 end loop;
 insert into public.orders(customer_id,total_amount,scheduled_for,status,notes) values(v_customer_id,p_total_amount,p_scheduled_for,'pending',p_notes) returning id into v_new_order_id;
 select code,status into v_new_order_code,v_order_status from public.orders where id=v_new_order_id;
 for cart_item in select * from unnest(p_cart_items) loop insert into public.order_items(order_id,product_id,quantity,price,cost) values(v_new_order_id,cart_item.product_id,cart_item.quantity,cart_item.price,cart_item.cost); end loop;
 with cart_expanded as(select ci.product_id,ci.quantity from unnest(p_cart_items) ci), needed_per_ingredient as(select rec.ingredient_id,sum(ci.quantity*rec.quantity_used) total_deduction from cart_expanded ci join public.products prod on ci.product_id=prod.id join public.product_recipes rec on ci.product_id=rec.product_id where rec.deduct_stock_automatically=true group by rec.ingredient_id) update public.ingredients set current_stock=current_stock-npi.total_deduction from needed_per_ingredient npi where public.ingredients.id=npi.ingredient_id;
 return query select v_new_order_id,v_new_order_code,v_order_status;
end;
$$;

revoke execute on function public.get_my_customer_basic_stats() from public,anon;
grant execute on function public.get_my_customer_basic_stats() to authenticated;
revoke execute on function public.get_my_customer_favorite_products(integer) from public,anon;
grant execute on function public.get_my_customer_favorite_products(integer) to authenticated;
revoke execute on function public.get_my_customer_rewards_progress() from public,anon;
grant execute on function public.get_my_customer_rewards_progress() to authenticated;
revoke execute on function public.generate_my_personal_reward_code(uuid) from public,anon;
grant execute on function public.generate_my_personal_reward_code(uuid) to authenticated;
revoke execute on function public.get_my_active_menu_products() from public,anon;
grant execute on function public.get_my_active_menu_products() to authenticated;
revoke execute on function public.record_my_discount_usage_and_deactivate(uuid) from public,anon;
grant execute on function public.record_my_discount_usage_and_deactivate(uuid) to authenticated;
revoke execute on function public.create_my_order_with_stock_check(numeric,timestamptz,public.cart_item[],varchar) from public,anon;
grant execute on function public.create_my_order_with_stock_check(numeric,timestamptz,public.cart_item[],varchar) to authenticated;
revoke execute on function public.get_customer_stats_batch(uuid[]) from anon;
grant execute on function public.get_customer_stats_batch(uuid[]) to authenticated;
