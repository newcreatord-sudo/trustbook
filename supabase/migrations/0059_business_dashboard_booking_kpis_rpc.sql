-- KPI dashboard attività: aggregazioni sul DB (nessun limite alle 3000 righe client).
-- Accesso: owner o staff tramite public.is_business_member.

create or replace function public.business_dashboard_booking_kpis(
  p_business_id uuid,
  p_timezone text default 'Europe/Rome'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz text := coalesce(nullif(trim(p_timezone), ''), 'Europe/Rome');
  today_local_date date;
  day_start timestamptz;
  day_end_exclusive timestamptz;
  win_start timestamptz;
  upcoming_end_exclusive timestamptz;

  v_completed int;
  v_no_show int;
  v_late_cancel int;
  v_forfeit_cents bigint;
  v_forfeit_cases int;
  v_today_active int;
  v_upcoming_7 int;
  v_pending int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_member(p_business_id) then
    raise exception 'not_allowed';
  end if;

  today_local_date := ((now() at time zone tz))::date;

  day_start := (today_local_date::timestamp without time zone at time zone tz);
  day_end_exclusive := ((today_local_date + 1)::timestamp without time zone at time zone tz);
  win_start := ((today_local_date - 30)::timestamp without time zone at time zone tz);
  upcoming_end_exclusive := ((today_local_date + 8)::timestamp without time zone at time zone tz);

  select count(*)::int into v_pending
  from public.bookings b
  where b.business_id = p_business_id
    and b.status in ('requested'::booking_status, 'pending_approval'::booking_status, 'change_proposed'::booking_status);

  select count(*)::int into v_today_active
  from public.bookings b
  where b.business_id = p_business_id
    and b.start_at >= day_start and b.start_at < day_end_exclusive
    and not (
      b.status in (
        'completed'::booking_status,
        'no_show'::booking_status,
        'late_cancel'::booking_status,
        'rejected'::booking_status
      )
      or b.status::text like 'cancelled%'
    );

  select count(*)::int into v_upcoming_7
  from public.bookings b
  where b.business_id = p_business_id
    and b.start_at >= day_start and b.start_at < upcoming_end_exclusive
    and not (
      b.status in (
        'completed'::booking_status,
        'no_show'::booking_status,
        'late_cancel'::booking_status,
        'rejected'::booking_status
      )
      or b.status::text like 'cancelled%'
    );

  select
    count(*) filter (where b.status = 'completed'::booking_status)::int,
    count(*) filter (where b.status = 'no_show'::booking_status)::int,
    count(*) filter (where b.status = 'late_cancel'::booking_status)::int,
    coalesce(sum(b.deposit_amount_cents) filter (
      where b.status = 'no_show'::booking_status
        and b.deposit_status = 'forfeited'::deposit_status
        and b.deposit_amount_cents > 0
    ), 0)::bigint,
    count(*) filter (
      where b.status = 'no_show'::booking_status
        and b.deposit_status = 'forfeited'::deposit_status
        and b.deposit_amount_cents > 0
    )::int
  into v_completed, v_no_show, v_late_cancel, v_forfeit_cents, v_forfeit_cases
  from public.bookings b
  where b.business_id = p_business_id
    and b.start_at >= win_start and b.start_at < day_end_exclusive;

  return jsonb_build_object(
    'timezone', tz,
    'day_start', day_start,
    'day_end_exclusive', day_end_exclusive,
    'window_start', win_start,
    'window_end_exclusive', day_end_exclusive,
    'today_active_count', v_today_active,
    'upcoming_7_active_count', v_upcoming_7,
    'pending_pipeline_count', v_pending,
    'last30', jsonb_build_object(
      'completed', v_completed,
      'no_show', v_no_show,
      'late_cancel', v_late_cancel,
      'show_denominator', v_completed + v_no_show,
      'forfeited_deposit_cents', v_forfeit_cents,
      'forfeited_deposit_cases', v_forfeit_cases
    )
  );
end;
$$;

comment on function public.business_dashboard_booking_kpis(uuid, text) is
  'Aggregati prenotazioni per dashboard attività (membro team). Finestre calendario nel fuso p_timezone.';

grant execute on function public.business_dashboard_booking_kpis(uuid, text) to authenticated;
