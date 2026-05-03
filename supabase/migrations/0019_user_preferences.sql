create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_visibility text not null default 'private' check (profile_visibility in ('private', 'public')),
  location_sharing text not null default 'off' check (location_sharing in ('off', 'city', 'precise')),
  notif_booking boolean not null default true,
  notif_deposit boolean not null default true,
  notif_messages boolean not null default true,
  notif_marketing boolean not null default false,
  channel_in_app boolean not null default true,
  channel_email boolean not null default true,
  updated_at timestamptz not null default now()
);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.user_preferences from anon;
grant select, insert, update, delete on public.user_preferences to authenticated;

