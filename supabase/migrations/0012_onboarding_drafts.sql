create table if not exists public.onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('business')),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.onboarding_drafts enable row level security;

drop policy if exists onboarding_drafts_select_own on public.onboarding_drafts;
create policy onboarding_drafts_select_own on public.onboarding_drafts
for select to authenticated
using (user_id = auth.uid());

drop policy if exists onboarding_drafts_upsert_own on public.onboarding_drafts;
create policy onboarding_drafts_upsert_own on public.onboarding_drafts
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists onboarding_drafts_update_own on public.onboarding_drafts;
create policy onboarding_drafts_update_own on public.onboarding_drafts
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists onboarding_drafts_delete_own on public.onboarding_drafts;
create policy onboarding_drafts_delete_own on public.onboarding_drafts
for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.onboarding_drafts to authenticated;

