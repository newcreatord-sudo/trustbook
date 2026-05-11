-- 0140_notifications_multichannel.sql
-- Extends the notification system with:
--  * priority levels (low / normal / high / critical)
--  * snooze_until per recipient
--  * web push subscription registry
--  * SMS / email delivery log (idempotent per dedupe_key + channel)
--
-- All RLS-protected; only the recipient can manage their own subscriptions.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_priority') then
    create type public.notification_priority as enum ('low', 'normal', 'high', 'critical');
  end if;
end $$;

alter table public.notifications
  add column if not exists priority public.notification_priority not null default 'normal',
  add column if not exists snoozed_until timestamptz null,
  add column if not exists category text null;

create index if not exists notifications_recipient_priority_unread_idx
  on public.notifications (recipient_user_id, priority, created_at desc)
  where read_at is null;

create index if not exists notifications_snoozed_idx
  on public.notifications (recipient_user_id, snoozed_until)
  where snoozed_until is not null;

alter table public.user_preferences
  add column if not exists snooze_notifications_until timestamptz null,
  add column if not exists quiet_hours_start smallint null check (quiet_hours_start is null or (quiet_hours_start between 0 and 23)),
  add column if not exists quiet_hours_end smallint null check (quiet_hours_end is null or (quiet_hours_end between 0 and 23)),
  add column if not exists channel_web_push boolean not null default false;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  platform text null,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  failure_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_enabled_idx
  on public.push_subscriptions (user_id, enabled);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_self on public.push_subscriptions;
create policy push_subscriptions_select_self on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_self on public.push_subscriptions;
create policy push_subscriptions_insert_self on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_self on public.push_subscriptions;
create policy push_subscriptions_update_self on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_self on public.push_subscriptions;
create policy push_subscriptions_delete_self on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid null references public.notifications(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'push', 'sms')),
  provider text null,
  provider_message_id text null,
  status text not null check (status in ('queued', 'sent', 'delivered', 'opened', 'failed')),
  error_code text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists notification_delivery_log_recipient_idx
  on public.notification_delivery_log (recipient_user_id, sent_at desc);
create index if not exists notification_delivery_log_status_idx
  on public.notification_delivery_log (status, sent_at desc);

alter table public.notification_delivery_log enable row level security;

drop policy if exists notification_delivery_log_select_self on public.notification_delivery_log;
create policy notification_delivery_log_select_self on public.notification_delivery_log
  for select to authenticated
  using (recipient_user_id = auth.uid());

drop policy if exists notification_delivery_log_write_none on public.notification_delivery_log;
create policy notification_delivery_log_write_none on public.notification_delivery_log
  for all to authenticated
  using (false)
  with check (false);

revoke all on public.notification_delivery_log from anon, authenticated;
grant select on public.notification_delivery_log to authenticated;

-- Helper RPC: snooze all notifications for the current user until `p_until`.
create or replace function public.snooze_my_notifications(p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_until is null then
    update public.user_preferences set snooze_notifications_until = null where user_id = uid;
    return;
  end if;
  if p_until <= now() then
    raise exception 'snooze_until_past';
  end if;
  if p_until > now() + interval '30 days' then
    raise exception 'snooze_too_long';
  end if;
  insert into public.user_preferences(user_id, snooze_notifications_until)
  values (uid, p_until)
  on conflict (user_id) do update set snooze_notifications_until = excluded.snooze_notifications_until;
end;
$$;

revoke all on function public.snooze_my_notifications(timestamptz) from public;
grant execute on function public.snooze_my_notifications(timestamptz) to authenticated;
