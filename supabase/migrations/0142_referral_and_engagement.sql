-- 0142_referral_and_engagement.sql
--
-- Customer engagement primitives:
--   * referral_codes  — one or more invite codes per user; redeems are tracked.
--   * referral_redemptions — audit trail of who joined via whom (idempotent).
--   * customer_lapsed_nudges — queued reactivation reminders for customers
--     who haven't booked in 90 days. The notification engine consumes these.

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique check (code = upper(code) and length(code) between 4 and 24),
  uses_count int not null default 0,
  max_uses int not null default 0 check (max_uses >= 0),
  reward_currency text not null default 'EUR',
  reward_referrer_cents int not null default 0 check (reward_referrer_cents >= 0),
  reward_referee_cents int not null default 0 check (reward_referee_cents >= 0),
  expires_at timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists referral_codes_owner_idx on public.referral_codes (owner_user_id);

alter table public.referral_codes enable row level security;

drop policy if exists referral_codes_select_owner on public.referral_codes;
create policy referral_codes_select_owner on public.referral_codes
  for select to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists referral_codes_insert_owner on public.referral_codes;
create policy referral_codes_insert_owner on public.referral_codes
  for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists referral_codes_update_owner on public.referral_codes;
create policy referral_codes_update_owner on public.referral_codes
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create table if not exists public.referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  referee_user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  reward_paid_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  unique (referral_code_id, referee_user_id)
);

create index if not exists referral_redemptions_referee_idx on public.referral_redemptions (referee_user_id);

alter table public.referral_redemptions enable row level security;

drop policy if exists referral_redemptions_select_party on public.referral_redemptions;
create policy referral_redemptions_select_party on public.referral_redemptions
  for select to authenticated
  using (
    referee_user_id = auth.uid()
    or exists (
      select 1 from public.referral_codes rc
      where rc.id = referral_redemptions.referral_code_id
        and rc.owner_user_id = auth.uid()
    )
  );

drop policy if exists referral_redemptions_write_none on public.referral_redemptions;
create policy referral_redemptions_write_none on public.referral_redemptions
  for all to authenticated
  using (false)
  with check (false);

-- RPC: claim_referral_code(p_code text) — called by referee after signup.
-- Validates the code is active, increments uses_count atomically (with max_uses),
-- creates the redemption row, returns the referral code id.

create or replace function public.claim_referral_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rc record;
  rid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'invalid_code';
  end if;

  select * into rc
  from public.referral_codes
  where code = upper(trim(p_code))
    and is_active = true
    and (expires_at is null or expires_at > now())
  for update;

  if rc.id is null then
    raise exception 'code_not_found_or_expired';
  end if;

  if rc.owner_user_id = uid then
    raise exception 'cannot_self_redeem';
  end if;

  if rc.max_uses > 0 and rc.uses_count >= rc.max_uses then
    raise exception 'code_exhausted';
  end if;

  insert into public.referral_redemptions (referral_code_id, referee_user_id)
  values (rc.id, uid)
  returning id into rid;

  update public.referral_codes
  set uses_count = uses_count + 1
  where id = rc.id;

  return rid;
exception
  when unique_violation then
    raise exception 'already_redeemed';
end;
$$;

revoke all on function public.claim_referral_code(text) from public;
grant execute on function public.claim_referral_code(text) to authenticated;

-- Lapsed customer nudges: enqueue a one-shot reactivation notification per
-- customer who hasn't booked in 90 days and isn't already nudged in the last
-- 60 days. Capped per run.

create or replace function public.enqueue_lapsed_customer_nudges(p_limit int default 200)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  enq int := 0;
  r record;
begin
  for r in
    select p.id as user_id
    from public.profiles p
    where p.role = 'cliente'
      and not exists (
        select 1 from public.bookings b
        where b.customer_user_id = p.id
          and b.created_at > now() - interval '90 days'
      )
      and not exists (
        select 1 from public.notification_jobs nj
        where nj.recipient_user_id = p.id
          and nj.kind = 'lapsed_nudge'
          and nj.created_at > now() - interval '60 days'
      )
    order by p.id
    limit greatest(1, least(2000, coalesce(p_limit, 200)))
  loop
    insert into public.notification_jobs (
      kind, recipient_user_id, business_id, booking_id, link, title, body, dedupe_key, scheduled_at
    ) values (
      'lapsed_nudge', r.user_id, null, null, '/esplora', 'Ti aspettiamo su TrustBook',
      'Sono passati 90 giorni dall''ultima prenotazione. Scopri novità vicino a te.',
      r.user_id::text || ':lapsed:' || to_char(now(), 'YYYYMM'),
      now()
    )
    on conflict (recipient_user_id, dedupe_key) do nothing;
    enq := enq + 1;
  end loop;
  return enq;
end;
$$;

revoke all on function public.enqueue_lapsed_customer_nudges(int) from public;
grant execute on function public.enqueue_lapsed_customer_nudges(int) to service_role;
