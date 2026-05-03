-- 0026_security_hardening.sql

-- 1) Prevent users from changing their own role and auto-create reliability for clients
create or replace function public.trg_profiles_security()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'UPDATE' and new.role is distinct from old.role then
    if auth.role() <> 'service_role' then
      raise exception 'not_allowed_to_change_role';
    end if;
  end if;

  if TG_OP = 'INSERT' and new.role = 'cliente' then
    insert into public.customer_reliability(user_id, score)
    values (new.id, 80)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_security_check on public.profiles;
create trigger profiles_security_check
before insert or update on public.profiles
for each row execute function public.trg_profiles_security();


-- 2) Customer reliability: revoke update/insert from authenticated users
drop policy if exists reliability_update_own on public.customer_reliability;
drop policy if exists reliability_insert_own on public.customer_reliability;
-- We leave the select policy active.
-- Updates/Inserts will be handled ONLY by security definer RPCs or service_role.


drop policy if exists bookings_insert_customer on public.bookings;
create or replace function public.trg_bookings_security()
returns trigger
language plpgsql
security definer
as $$
declare
  is_service boolean;
  caller uuid;
  is_member boolean;
begin
  is_service := auth.role() = 'service_role';
  if is_service then return new; end if;

  caller := auth.uid();
  is_member := public.is_business_member(old.business_id);

  -- Immutable core fields
  if new.customer_user_id is distinct from old.customer_user_id then raise exception 'immutable_customer_user_id'; end if;
  if new.business_id is distinct from old.business_id then raise exception 'immutable_business_id'; end if;
  if new.service_id is distinct from old.service_id then raise exception 'immutable_service_id'; end if;

  -- Restrictions for customers (if caller is customer AND NOT a business member)
  if caller = old.customer_user_id and not is_member then
    -- Cannot change deposit requirements
    if new.deposit_amount_cents is distinct from old.deposit_amount_cents then raise exception 'immutable_deposit_amount'; end if;
    if new.deposit_status is distinct from old.deposit_status then raise exception 'immutable_deposit_status'; end if;

    -- Cannot spoof completion/no-shows
    if new.status in ('completed', 'no_show', 'cancelled_by_business', 'rejected') and new.status is distinct from old.status then
      raise exception 'unauthorized_status_transition';
    end if;

    if new.no_show_at is distinct from old.no_show_at then raise exception 'unauthorized_no_show_at'; end if;
    if new.completed_at is distinct from old.completed_at then raise exception 'unauthorized_completed_at'; end if;
    if new.confirmed_at is distinct from old.confirmed_at and new.confirmed_at is not null and old.status <> 'change_proposed' then
      -- allow customer to set confirmed_at ONLY if they are accepting a proposal
      raise exception 'unauthorized_confirmed_at';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_security_check on public.bookings;
create trigger bookings_security_check
before update on public.bookings
for each row execute function public.trg_bookings_security();

