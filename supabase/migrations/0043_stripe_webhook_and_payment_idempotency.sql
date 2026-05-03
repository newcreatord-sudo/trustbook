create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  stripe_created_at timestamptz,
  processed_at timestamptz not null default now()
);

revoke all on table public.stripe_webhook_events from public;
revoke all on table public.stripe_webhook_events from authenticated;
grant all on table public.stripe_webhook_events to service_role;

create unique index if not exists booking_payments_open_created_unique
on public.booking_payments (booking_id, provider, kind)
where status = 'created';
