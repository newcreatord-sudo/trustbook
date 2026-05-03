grant select on public.businesses to anon;
grant select on public.services to anon;
grant select on public.business_opening_windows to anon;
grant select on public.business_closures to anon;
grant select on public.reviews to anon;

grant select on public.businesses to authenticated;
grant select on public.services to authenticated;
grant select on public.business_opening_windows to authenticated;
grant select on public.business_closures to authenticated;
grant select on public.reviews to authenticated;

drop policy if exists businesses_select_public on public.businesses;
create policy businesses_select_public on public.businesses
for select to anon
using (true);

drop policy if exists services_select_public on public.services;
create policy services_select_public on public.services
for select to anon
using (is_active = true);

drop policy if exists opening_windows_select_public on public.business_opening_windows;
create policy opening_windows_select_public on public.business_opening_windows
for select to anon
using (true);

drop policy if exists closures_select_public on public.business_closures;
create policy closures_select_public on public.business_closures
for select to anon
using (true);

drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews
for select to anon
using (direction = 'customer_to_business');

