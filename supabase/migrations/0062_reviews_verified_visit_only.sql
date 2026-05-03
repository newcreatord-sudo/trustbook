-- Reviews tied to real outcomes only (anti-fake public ratings).
-- Customer→business: only after booking is completed server-side, slot ended, within window.
-- Business→customer: after verified completed visit OR documented no-show, within window (staff/owner via is_business_member).

drop policy if exists reviews_insert_author on public.reviews;
drop policy if exists reviews_insert_customer_verified_visit on public.reviews;
drop policy if exists reviews_insert_business_verified_outcome on public.reviews;

create policy reviews_insert_customer_verified_visit on public.reviews
for insert to authenticated
with check (
  direction = 'customer_to_business'
  and author_user_id = auth.uid()
  and exists (
    select 1
    from public.bookings bk
    where bk.id = booking_id
      and bk.business_id = business_id
      and bk.customer_user_id = auth.uid()
      and bk.status = 'completed'
      and bk.completed_at is not null
      and bk.end_at <= now()
      and bk.end_at >= now() - interval '90 days'
  )
);

create policy reviews_insert_business_verified_outcome on public.reviews
for insert to authenticated
with check (
  direction = 'business_to_customer'
  and author_user_id = auth.uid()
  and exists (
    select 1
    from public.bookings bk
    where bk.id = booking_id
      and bk.business_id = business_id
      and public.is_business_member(bk.business_id)
      and bk.end_at <= now()
      and (
        (
          bk.status = 'completed'
          and bk.completed_at is not null
          and bk.end_at >= now() - interval '90 days'
        )
        or (
          bk.status = 'no_show'
          and bk.no_show_at is not null
          and bk.no_show_at <= now()
          and bk.no_show_at >= now() - interval '90 days'
        )
      )
  )
);
