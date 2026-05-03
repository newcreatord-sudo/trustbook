-- 0052_profiles_role_switch_reliability.sql
-- Allow safe self-switch cliente <-> attività (portal UX), bootstrap reliability row on switch,
-- without client-side upsert that could reset scores if policies ever regress.

create or replace function public.trg_profiles_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      null;
    elsif auth.uid() is not distinct from new.id
      and old.role in ('cliente'::public.user_role, 'attivita'::public.user_role)
      and new.role in ('cliente'::public.user_role, 'attivita'::public.user_role)
    then
      null;
    else
      raise exception 'not_allowed_to_change_role';
    end if;
  end if;

  if TG_OP = 'INSERT' and new.role = 'cliente'::public.user_role then
    insert into public.customer_reliability(user_id, score)
    values (new.id, 80)
    on conflict (user_id) do nothing;
  end if;

  if TG_OP = 'UPDATE'
    and new.role = 'cliente'::public.user_role
    and old.role is distinct from 'cliente'::public.user_role
  then
    insert into public.customer_reliability(user_id, score)
    values (new.id, 80)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;
