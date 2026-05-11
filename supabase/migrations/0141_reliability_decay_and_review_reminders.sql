-- 0141_reliability_decay_and_review_reminders.sql
--
-- Goals
--   1. Time-based reliability *recovery* (a small positive nudge per month of
--      clean activity) so customers can rebuild trust without re-living a single
--      no-show forever.
--   2. Automated review reminders (queued in `notification_jobs`) 6 hours after
--      booking completion. The existing dispatcher will pick them up.
--
-- Reliability decay is applied via an SECURITY DEFINER function that the
-- platform cron will call once per day. It is bounded so it cannot manufacture
-- reputation: max +5 points per month, capped at the historical maximum.

create or replace function public.apply_reliability_monthly_recovery()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  processed int := 0;
  recovery_step int := 5;
begin
  with eligible as (
    select cr.user_id, cr.score
    from public.customer_reliability cr
    where cr.score < 100
      and cr.updated_at < now() - interval '30 days'
      and coalesce(cr.no_show_count, 0) = 0
  ),
  updated as (
    update public.customer_reliability cr
    set
      score = least(100, cr.score + recovery_step),
      updated_at = now()
    from eligible e
    where cr.user_id = e.user_id
    returning cr.user_id
  )
  select count(*) into processed from updated;

  return processed;
end;
$$;

revoke all on function public.apply_reliability_monthly_recovery() from public;
grant execute on function public.apply_reliability_monthly_recovery() to service_role;

-- Review reminder scheduling: enqueue a `review_reminder` notification job
-- 6h after a booking transitions to `completed`. Idempotent via dedupe_key.

create or replace function public.upsert_booking_review_reminder(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  link_customer text := '/prenotazioni';
begin
  select id, business_id, customer_user_id, status, end_at
  into b
  from public.bookings
  where id = p_booking_id;

  if b is null or b.customer_user_id is null then
    return;
  end if;

  if b.status <> 'completed' then
    update public.notification_jobs
    set status = 'cancelled'
    where booking_id = p_booking_id
      and kind = 'review_reminder'
      and status in ('scheduled', 'processing');
    return;
  end if;

  insert into public.notification_jobs (
    kind,
    recipient_user_id,
    business_id,
    booking_id,
    link,
    title,
    body,
    dedupe_key,
    scheduled_at
  ) values (
    'review_reminder',
    b.customer_user_id,
    b.business_id,
    b.id,
    link_customer,
    'Lascia una recensione',
    'Com''è andata? La tua recensione aiuta gli altri clienti e premia chi è affidabile.',
    p_booking_id::text || ':review_reminder',
    coalesce(b.end_at, now()) + interval '6 hours'
  )
  on conflict (recipient_user_id, dedupe_key) do nothing;
end;
$$;

revoke all on function public.upsert_booking_review_reminder(uuid) from public;
grant execute on function public.upsert_booking_review_reminder(uuid) to service_role;

create or replace function public.trg_booking_review_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and new.status = 'completed' and (old.status is distinct from 'completed')) then
    perform public.upsert_booking_review_reminder(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_booking_review_reminder on public.bookings;
create trigger trg_booking_review_reminder
after update on public.bookings
for each row execute function public.trg_booking_review_reminder();
