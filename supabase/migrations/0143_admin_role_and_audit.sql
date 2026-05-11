-- 0143_admin_role_and_audit.sql
--
-- Platform admin (Trust & Safety) role and audit trail.
--
--   * profiles.is_admin BOOLEAN
--   * admin_audit_log table — every privileged action is logged.
--   * helper RPC is_platform_admin() with security definer guarantees.
--   * RLS policies that grant admins read access to moderation surfaces.
--
-- Note: making a user admin still requires manual DB update (or running a
-- one-off migration that toggles a known seed email). This is intentional —
-- self-promotion paths are not exposed.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_platform_admin(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = coalesce(p_user, auth.uid())),
    false
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to authenticated;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_kind text not null,
  target_id text not null,
  rationale text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_action_idx on public.admin_audit_log (action, created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_select_admin on public.admin_audit_log;
create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated
  using (public.is_platform_admin());

drop policy if exists admin_audit_log_insert_self on public.admin_audit_log;
create policy admin_audit_log_insert_self on public.admin_audit_log
  for insert to authenticated
  with check (admin_user_id = auth.uid() and public.is_platform_admin());

drop policy if exists admin_audit_log_write_none on public.admin_audit_log;
create policy admin_audit_log_write_none on public.admin_audit_log
  for update to authenticated
  using (false)
  with check (false);

drop policy if exists admin_audit_log_delete_none on public.admin_audit_log;
create policy admin_audit_log_delete_none on public.admin_audit_log
  for delete to authenticated
  using (false);

create or replace function public.admin_log_action(
  p_action text,
  p_target_kind text,
  p_target_id text,
  p_rationale text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_platform_admin(uid) then
    raise exception 'not_admin';
  end if;
  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'invalid_action';
  end if;
  insert into public.admin_audit_log (admin_user_id, action, target_kind, target_id, rationale, payload)
  values (uid, p_action, p_target_kind, p_target_id, p_rationale, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_log_action(text, text, text, text, jsonb) from public;
grant execute on function public.admin_log_action(text, text, text, text, jsonb) to authenticated;
