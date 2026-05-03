alter table public.businesses
  add column if not exists listing_visible boolean not null default true;

drop policy if exists businesses_select_public on public.businesses;
create policy businesses_select_public on public.businesses
for select to anon
using (listing_visible = true);

drop policy if exists businesses_select_authed on public.businesses;
create policy businesses_select_authed on public.businesses
for select to authenticated
using (listing_visible = true or public.is_business_member(id));

