create table if not exists favorite_businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, business_id)
);

alter table favorite_businesses enable row level security;

drop policy if exists favorite_businesses_select_own on favorite_businesses;
create policy favorite_businesses_select_own on favorite_businesses
for select to authenticated
using (user_id = auth.uid());

drop policy if exists favorite_businesses_insert_own on favorite_businesses;
create policy favorite_businesses_insert_own on favorite_businesses
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists favorite_businesses_delete_own on favorite_businesses;
create policy favorite_businesses_delete_own on favorite_businesses
for delete to authenticated
using (user_id = auth.uid());

