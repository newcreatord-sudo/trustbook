create or replace function public.business_add_staff_by_email(
  p_business_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_user_id uuid;
  v_team_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'invalid_email';
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is null then
    raise exception 'user_not_found';
  end if;

  insert into public.team_members (business_id, user_id, role)
  values (p_business_id, v_user_id, 'staff')
  on conflict (business_id, user_id) do update
  set role = excluded.role
  returning id into v_team_member_id;

  return v_team_member_id;
end;
$$;

revoke all on function public.business_add_staff_by_email(uuid, text) from public;
grant execute on function public.business_add_staff_by_email(uuid, text) to authenticated;

