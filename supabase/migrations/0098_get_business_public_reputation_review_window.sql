-- Align public avg_rating/review_count with the same sliding window as operational KPIs (p_window_days).

create or replace function public.get_business_public_reputation(
  p_business_id uuid,
  p_window_days int default 90
)
returns table (
  business_id uuid,
  window_days int,
  avg_rating numeric,
  review_count int,
  confirmed_rate numeric,
  cancelled_by_business_rate numeric,
  response_time_avg_minutes numeric,
  on_time_rate numeric,
  computed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_window_days is null or p_window_days < 7 or p_window_days > 365 then
    raise exception 'invalid_window_days';
  end if;

  if not exists (select 1 from public.businesses b where b.id = p_business_id) then
    return;
  end if;

  if not exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
      and (
        b.listing_visible = true
        or public.is_business_member(p_business_id)
      )
  ) then
    return;
  end if;

  return query
  with
  r as (
    select
      avg(rv.rating)::numeric(10,2) as avg_rating,
      count(*)::int as review_count
    from public.reviews rv
    where rv.business_id = p_business_id
      and rv.direction = 'customer_to_business'
      and rv.created_at >= now() - make_interval(days => p_window_days)
  ),
  bw as (
    select
      bk.id,
      bk.status,
      bk.created_at,
      bk.updated_at,
      bk.confirmed_at,
      bk.cancelled_at,
      bk.start_at,
      bk.checked_in_at
    from public.bookings bk
    where bk.business_id = p_business_id
      and bk.created_at >= now() - make_interval(days => p_window_days)
  ),
  m as (
    select
      count(*)::int as total_requests,
      count(*) filter (where bw.status in ('confirmed','pending_deposit','completed','no_show','late_cancel'))::int as confirmedish,
      count(*) filter (where bw.status = 'cancelled_by_business')::int as cancelled_by_business,
      avg(
        extract(epoch from (decision_at - created_at)) / 60.0
      ) as response_time_avg_minutes
    from (
      select
        bw.created_at,
        bw.status,
        case
          when bw.confirmed_at is not null and bw.cancelled_at is not null then least(bw.confirmed_at, bw.cancelled_at)
          when bw.confirmed_at is not null then bw.confirmed_at
          when bw.cancelled_at is not null then bw.cancelled_at
          when bw.status = 'rejected' then bw.updated_at
          else null
        end as decision_at
      from bw
    ) x
    where decision_at is not null
      and decision_at >= created_at
  ),
  p as (
    select
      count(*) filter (where bw.status = 'completed' and bw.checked_in_at is not null)::int as completed_checked_in,
      count(*) filter (
        where bw.status = 'completed'
          and bw.checked_in_at is not null
          and bw.checked_in_at <= bw.start_at + interval '10 minutes'
      )::int as on_time
    from bw
  )
  select
    p_business_id as business_id,
    p_window_days as window_days,
    coalesce(r.avg_rating, 0)::numeric as avg_rating,
    coalesce(r.review_count, 0)::int as review_count,
    case when coalesce(m.total_requests, 0) > 0 then (m.confirmedish::numeric / m.total_requests::numeric) else null end as confirmed_rate,
    case when coalesce(m.total_requests, 0) > 0 then (m.cancelled_by_business::numeric / m.total_requests::numeric) else null end as cancelled_by_business_rate,
    m.response_time_avg_minutes::numeric(10,2) as response_time_avg_minutes,
    case when coalesce(p.completed_checked_in, 0) > 0 then (p.on_time::numeric / p.completed_checked_in::numeric) else null end as on_time_rate,
    now() as computed_at
  from r
  cross join m
  cross join p;
end
$$;
