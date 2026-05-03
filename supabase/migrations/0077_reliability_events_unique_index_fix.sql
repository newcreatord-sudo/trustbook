-- Fix: apply_reliability_delta uses `on conflict (user_id, booking_id, kind)`.
-- A partial unique index cannot be inferred by ON CONFLICT without a matching WHERE clause.
-- Replace the partial unique index with a full unique index on (user_id, booking_id, kind).

drop index if exists public.reliability_events_unique_booking_kind;

create unique index if not exists reliability_events_unique_user_booking_kind
on public.reliability_events (user_id, booking_id, kind);

