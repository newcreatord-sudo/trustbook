create or replace function public.list_business_operational_notes(
  p_business_id uuid,
  p_limit int default 50
)
returns table (
  id uuid,
  business_id uuid,
  title text,
  body text,
  tags text[],
  pinned boolean,
  agent_id text,
  created_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_member(p_business_id) then
    raise exception 'member_only';
  end if;

  v_lim := public.clamp_int(coalesce(p_limit, 50), 1, 200);

  return query
  select
    n.id,
    n.business_id,
    n.title,
    n.body,
    n.tags,
    n.pinned,
    n.agent_id,
    n.created_by_user_id,
    n.created_at,
    n.updated_at
  from public.business_operational_notes n
  where n.business_id = p_business_id
  order by n.pinned desc, n.updated_at desc
  limit v_lim;
end;
$$;

revoke all on function public.list_business_operational_notes(uuid, int) from public;
grant execute on function public.list_business_operational_notes(uuid, int) to authenticated;

