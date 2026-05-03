drop policy if exists bookings_insert_customer on public.bookings;

create policy bookings_insert_none on public.bookings
for insert to authenticated
with check (false);

