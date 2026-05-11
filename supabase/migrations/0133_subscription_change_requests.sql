-- Renumbered from 0045_subscription_change_requests.sql (duplicate prefix audit).
-- Content unchanged; only file prefix moved to a unique monotonic position.
create table if not exists public.subscription_change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  current_plan_id text not null references public.subscription_plans(id),
  target_plan_id text not null references public.subscription_plans(id),
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  request_note text,
  admin_note text,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscription_change_requests_one_pending_per_business
on public.subscription_change_requests (business_id)
where status = 'pending';

create table if not exists public.subscription_change_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.subscription_change_requests(id) on delete cascade,
  action text not null check (action in ('requested', 'approved', 'rejected', 'cancelled')),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists subscription_change_requests_set_updated_at on public.subscription_change_requests;
create trigger subscription_change_requests_set_updated_at
before update on public.subscription_change_requests
for each row execute function public.set_updated_at();

alter table public.subscription_change_requests enable row level security;
alter table public.subscription_change_request_events enable row level security;

drop policy if exists subscription_change_requests_select_owner_staff on public.subscription_change_requests;
create policy subscription_change_requests_select_owner_staff on public.subscription_change_requests
for select to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.business_id = subscription_change_requests.business_id
      and tm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.businesses b
    where b.id = subscription_change_requests.business_id
      and b.owner_user_id = auth.uid()
  )
);

drop policy if exists subscription_change_requests_insert_owner on public.subscription_change_requests;
create policy subscription_change_requests_insert_owner on public.subscription_change_requests
for insert to authenticated
with check (
  requested_by_user_id = auth.uid()
  and exists (
    select 1
    from public.businesses b
    where b.id = subscription_change_requests.business_id
      and b.owner_user_id = auth.uid()
  )
);

drop policy if exists subscription_change_requests_write_none on public.subscription_change_requests;
create policy subscription_change_requests_write_none on public.subscription_change_requests
for update to authenticated
using (false)
with check (false);

drop policy if exists subscription_change_request_events_select_owner_staff on public.subscription_change_request_events;
create policy subscription_change_request_events_select_owner_staff on public.subscription_change_request_events
for select to authenticated
using (
  exists (
    select 1
    from public.subscription_change_requests r
    join public.team_members tm on tm.business_id = r.business_id
    where r.id = subscription_change_request_events.request_id
      and tm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.subscription_change_requests r
    join public.businesses b on b.id = r.business_id
    where r.id = subscription_change_request_events.request_id
      and b.owner_user_id = auth.uid()
  )
);

drop policy if exists subscription_change_request_events_write_none on public.subscription_change_request_events;
create policy subscription_change_request_events_write_none on public.subscription_change_request_events
for all to authenticated
using (false)
with check (false);

create or replace function public.request_business_plan_change(
  p_business_id uuid,
  p_target_plan_id text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current_plan_id text;
  v_target_active boolean;
  v_request_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'forbidden_not_owner';
  end if;

  select bs.plan_id
    into v_current_plan_id
  from public.business_subscriptions bs
  where bs.business_id = p_business_id;

  if v_current_plan_id is null then
    raise exception 'subscription_not_found';
  end if;

  if v_current_plan_id = p_target_plan_id then
    raise exception 'already_on_target_plan';
  end if;

  select sp.is_active
    into v_target_active
  from public.subscription_plans sp
  where sp.id = p_target_plan_id
    and sp.target_audience = 'business';

  if coalesce(v_target_active, false) = false then
    raise exception 'target_plan_not_active';
  end if;

  begin
    insert into public.subscription_change_requests (
      business_id,
      requested_by_user_id,
      current_plan_id,
      target_plan_id,
      status,
      request_note
    ) values (
      p_business_id,
      v_uid,
      v_current_plan_id,
      p_target_plan_id,
      'pending',
      nullif(trim(coalesce(p_note, '')), '')
    )
    returning id into v_request_id;
  exception
    when unique_violation then
      select r.id
        into v_request_id
      from public.subscription_change_requests r
      where r.business_id = p_business_id
        and r.status = 'pending'
      order by r.created_at desc
      limit 1;
      if v_request_id is null then
        raise;
      end if;
  end;

  insert into public.subscription_change_request_events (
    request_id,
    action,
    actor_user_id,
    metadata
  ) values (
    v_request_id,
    'requested',
    v_uid,
    jsonb_build_object(
      'current_plan_id', v_current_plan_id,
      'target_plan_id', p_target_plan_id
    )
  );

  return v_request_id;
end;
$$;

revoke all on function public.request_business_plan_change(uuid, text, text) from public;
grant execute on function public.request_business_plan_change(uuid, text, text) to authenticated;
