drop policy if exists services_select_public on public.services;
create policy services_select_public on public.services
for select to anon
using (
  is_active = true
  and exists (
    select 1 from public.businesses b
    where b.id = business_id
      and b.listing_visible = true
  )
);

drop policy if exists services_select_authed on public.services;
create policy services_select_authed on public.services
for select to authenticated
using (
  public.is_business_member(business_id)
  or (
    is_active = true
    and exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.listing_visible = true
    )
  )
);

drop policy if exists opening_windows_select_public on public.business_opening_windows;
create policy opening_windows_select_public on public.business_opening_windows
for select to anon
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id
      and b.listing_visible = true
  )
);

drop policy if exists opening_windows_select_authed on public.business_opening_windows;
create policy opening_windows_select_authed on public.business_opening_windows
for select to authenticated
using (
  public.is_business_member(business_id)
  or exists (
    select 1 from public.businesses b
    where b.id = business_id
      and b.listing_visible = true
  )
);

drop policy if exists closures_select_public on public.business_closures;
create policy closures_select_public on public.business_closures
for select to anon
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id
      and b.listing_visible = true
  )
);

drop policy if exists closures_select_authed on public.business_closures;
create policy closures_select_authed on public.business_closures
for select to authenticated
using (
  public.is_business_member(business_id)
  or exists (
    select 1 from public.businesses b
    where b.id = business_id
      and b.listing_visible = true
  )
);

drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews
for select to anon
using (
  direction = 'customer_to_business'
  and exists (
    select 1 from public.businesses b
    where b.id = business_id
      and b.listing_visible = true
  )
);

drop policy if exists reviews_select_authed on public.reviews;
create policy reviews_select_authed on public.reviews
for select to authenticated
using (
  public.is_business_member(business_id)
  or author_user_id = auth.uid()
  or (
    direction = 'customer_to_business'
    and exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.listing_visible = true
    )
  )
);

