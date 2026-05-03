-- 0029_resolve_user_rpc.sql

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not_authorized';
  end if;

  select id into uid
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;

  return uid;
end;
$$;
