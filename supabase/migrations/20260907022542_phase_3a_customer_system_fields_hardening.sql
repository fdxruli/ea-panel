-- FASE 3A: protect customer identity/system columns during authenticated updates.
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