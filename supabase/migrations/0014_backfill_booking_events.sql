insert into public.booking_events (booking_id, business_id, kind, visibility, actor_user_id, payload, created_at)
select
  b.id,
  b.business_id,
  'booking_created',
  'all',
  b.customer_user_id,
  jsonb_build_object('start_at', b.start_at, 'end_at', b.end_at, 'service_id', b.service_id),
  b.created_at
from public.bookings b
where not exists (
  select 1 from public.booking_events e where e.booking_id = b.id
);

