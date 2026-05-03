create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider text not null check (provider in ('stripe')),
  kind text not null check (kind in ('deposit')),
  amount_cents int not null,
  currency text not null default 'eur',
  stripe_session_id text,
  stripe_payment_intent_id text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stripe_session_id)
);

drop trigger if exists booking_payments_set_updated_at on public.booking_payments;
create trigger booking_payments_set_updated_at
before update on public.booking_payments
for each row execute function public.set_updated_at();

alter table public.booking_payments enable row level security;

drop policy if exists booking_payments_select_participants on public.booking_payments;
create policy booking_payments_select_participants on public.booking_payments
for select to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (b.customer_user_id = auth.uid() or public.is_business_member(b.business_id))
  )
);

drop policy if exists booking_payments_write_none on public.booking_payments;
create policy booking_payments_write_none on public.booking_payments
for all to authenticated
using (false)
with check (false);

grant select on public.booking_payments to authenticated;

