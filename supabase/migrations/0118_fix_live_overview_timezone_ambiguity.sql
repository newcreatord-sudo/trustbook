create or replace function public.list_business_live_overview(
  p_at timestamptz default now()
)
returns table (
  business_id uuid,
  business_name text,
  timezone text,
  pending_pipeline_count int,
  today_active_count int,
  upcoming_7_active_count int,
  last30_completed int,
  last30_no_show int,
  last30_late_cancel int,
  last30_show_denominator int,
  last30_forfeited_deposit_cents bigint,
  last30_forfeited_deposit_cases int,
  estimated_revenue_today_cents bigint,
  occupied_resource_count int,
  total_active_resources int,
  avg_rating_last30 numeric,
  reviews_last30 int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid;
  b record;
  tz text;
  day_start timestamptz;
  day_end_exclusive timestamptz;
  window_start timestamptz;
  upcoming_end_exclusive timestamptz;
  pending_count int;
  today_count int;
  upcoming_count int;
  c_completed int;
  c_no_show int;
  c_late_cancel int;
  denom int;
  forfeited_cents bigint;
  forfeited_cases int;
  est_rev bigint;
  occ_count int;
  total_res int;
  avg_rating numeric;
  reviews_count int;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_at is null then
    raise exception 'invalid_at';
  end if;

  for b in
    select bz.id, bz.name, coalesce(bz.timezone, 'Europe/Rome') as timezone
    from public.businesses bz
    where bz.owner_user_id = uid
    union
    select bs.id, bs.name, coalesce(bs.timezone, 'Europe/Rome') as timezone
    from public.team_members tm
    join public.businesses bs on bs.id = tm.business_id
    where tm.user_id = uid
  loop
    tz := coalesce(b.timezone, 'Europe/Rome');
    day_start := (date_trunc('day', (p_at at time zone tz)) at time zone tz);
    day_end_exclusive := ((date_trunc('day', (p_at at time zone tz)) + interval '1 day') at time zone tz);
    window_start := ((date_trunc('day', (p_at at time zone tz)) - interval '30 days') at time zone tz);
    upcoming_end_exclusive := ((date_trunc('day', (p_at at time zone tz)) + interval '8 days') at time zone tz);

    select count(*)::int
    into pending_count
    from public.bookings bk
    where bk.business_id = b.id
      and bk.status in ('requested', 'pending_approval', 'change_proposed');

    select count(*)::int
    into today_count
    from public.bookings bk
    where bk.business_id = b.id
      and bk.start_at >= day_start
      and bk.start_at < day_end_exclusive
      and bk.status <> 'rejected'
      and bk.status <> 'completed'
      and bk.status <> 'no_show'
      and bk.status <> 'late_cancel'
      and bk.status::text not like 'cancelled%';

    select count(*)::int
    into upcoming_count
    from public.bookings bk
    where bk.business_id = b.id
      and bk.start_at >= day_start
      and bk.start_at < upcoming_end_exclusive
      and bk.status <> 'rejected'
      and bk.status <> 'completed'
      and bk.status <> 'no_show'
      and bk.status <> 'late_cancel'
      and bk.status::text not like 'cancelled%';

    select
      count(*) filter (where bk.status = 'completed')::int,
      count(*) filter (where bk.status = 'no_show')::int,
      count(*) filter (where bk.status = 'late_cancel')::int
    into c_completed, c_no_show, c_late_cancel
    from public.bookings bk
    where bk.business_id = b.id
      and bk.start_at >= window_start
      and bk.start_at < day_end_exclusive;

    denom := coalesce(c_completed, 0) + coalesce(c_no_show, 0);

    select
      coalesce(sum(bk.deposit_amount_cents)::bigint, 0)::bigint,
      count(*)::int
    into forfeited_cents, forfeited_cases
    from public.bookings bk
    where bk.business_id = b.id
      and bk.start_at >= window_start
      and bk.start_at < day_end_exclusive
      and bk.status = 'no_show'
      and bk.deposit_status = 'forfeited'
      and bk.deposit_amount_cents > 0;

    select coalesce(sum(s.price_cents)::bigint, 0)::bigint
    into est_rev
    from public.bookings bk
    join public.services s on s.id = bk.service_id
    where bk.business_id = b.id
      and bk.start_at >= day_start
      and bk.start_at < day_end_exclusive
      and bk.status <> 'rejected'
      and bk.status <> 'completed'
      and bk.status <> 'no_show'
      and bk.status <> 'late_cancel'
      and bk.status::text not like 'cancelled%';

    select count(*)::int
    into total_res
    from public.business_booking_resources br
    join public.business_floor_plans fp on fp.id = br.floor_plan_id
    where br.business_id = b.id
      and br.is_active = true
      and fp.is_active = true;

    select count(distinct br.id)::int
    into occ_count
    from public.booking_resource_assignments bra
    join public.bookings bk on bk.id = bra.booking_id
    join public.business_booking_resources br on br.id = bra.primary_resource_id
    join public.business_floor_plans fp on fp.id = br.floor_plan_id
    where br.business_id = b.id
      and br.is_active = true
      and fp.is_active = true
      and bk.status in (
        'pending_deposit',
        'requires_deposit',
        'pending_payment_setup',
        'confirmed',
        'change_proposed',
        'completed',
        'no_show',
        'late_cancel'
      )
      and bk.start_at < p_at
      and bk.end_at > p_at;

    select
      avg(rv.rating)::numeric,
      count(*)::int
    into avg_rating, reviews_count
    from public.reviews rv
    where rv.business_id = b.id
      and rv.direction = 'customer_to_business'
      and rv.created_at >= window_start
      and rv.created_at < day_end_exclusive;

    business_id := b.id;
    business_name := b.name;
    timezone := tz;
    pending_pipeline_count := coalesce(pending_count, 0);
    today_active_count := coalesce(today_count, 0);
    upcoming_7_active_count := coalesce(upcoming_count, 0);
    last30_completed := coalesce(c_completed, 0);
    last30_no_show := coalesce(c_no_show, 0);
    last30_late_cancel := coalesce(c_late_cancel, 0);
    last30_show_denominator := coalesce(denom, 0);
    last30_forfeited_deposit_cents := coalesce(forfeited_cents, 0);
    last30_forfeited_deposit_cases := coalesce(forfeited_cases, 0);
    estimated_revenue_today_cents := coalesce(est_rev, 0);
    occupied_resource_count := coalesce(occ_count, 0);
    total_active_resources := coalesce(total_res, 0);
    avg_rating_last30 := avg_rating;
    reviews_last30 := coalesce(reviews_count, 0);
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.list_business_live_overview(timestamptz) from public;
grant execute on function public.list_business_live_overview(timestamptz) to authenticated;

