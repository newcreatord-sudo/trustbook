-- Slot prenotabili: unica fonte di verità allineata ai guard di create_booking_v3 (no affidabilità/deposito cliente).

CREATE OR REPLACE FUNCTION public.list_bookable_slots_for_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_on date,
  p_staff_id uuid DEFAULT NULL
)
RETURNS TABLE(start_at timestamptz, end_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b_tz text;
  b_lead int;
  b_allow_ob boolean;
  b_paused boolean;
  b_min_gap int;
  dur int;
  buf_bef int;
  buf_aft int;
  svc_active boolean;
  v_dow numeric;
  lead_cutoff timestamptz;
  slot_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
  actual_start timestamptz;
  actual_end timestamptz;
  cur_min int;
  win_start_min int;
  win_end_min int;
  step_min int;
  overlap_booking boolean;
  w record;
BEGIN
  SELECT
    coalesce(timezone, 'Europe/Rome'),
    coalesce(booking_lead_time_min, 0),
    coalesce(allow_overbooking, false),
    coalesce(is_paused, false),
    greatest(0, coalesce(min_gap_min, 0))
  INTO b_tz, b_lead, b_allow_ob, b_paused, b_min_gap
  FROM public.businesses
  WHERE id = p_business_id;

  IF NOT FOUND OR b_paused THEN
    RETURN;
  END IF;

  SELECT
    coalesce(s.duration_min, 0),
    coalesce(s.buffer_before_min, 0),
    coalesce(s.buffer_after_min, 0),
    coalesce(s.is_active, false)
  INTO dur, buf_bef, buf_aft, svc_active
  FROM public.services s
  WHERE s.id = p_service_id
    AND s.business_id = p_business_id;

  IF dur <= 0 OR NOT svc_active THEN
    RETURN;
  END IF;

  IF p_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.id = p_staff_id
        AND tm.business_id = p_business_id
        AND coalesce(tm.is_bookable, true)
    ) THEN
      RETURN;
    END IF;
  END IF;

  lead_cutoff := now() + make_interval(mins => greatest(0, b_lead));
  v_dow := extract(dow from p_on);

  FOR w IN
    SELECT bow.start_time, bow.end_time
    FROM public.business_opening_windows bow
    WHERE bow.business_id = p_business_id
      AND bow.weekday = v_dow
    ORDER BY bow.start_time
  LOOP
    win_start_min :=
      extract(hour from w.start_time)::int * 60 + extract(minute from w.start_time)::int;
    win_end_min :=
      extract(hour from w.end_time)::int * 60 + extract(minute from w.end_time)::int;

    IF win_end_min <= win_start_min THEN
      CONTINUE;
    END IF;

    step_min := dur + b_min_gap;
    cur_min := win_start_min;

    WHILE cur_min + dur <= win_end_min LOOP
      slot_local := p_on::timestamp + make_interval(mins => cur_min);
      v_start := slot_local AT TIME ZONE b_tz;
      v_end := (p_on::timestamp + make_interval(mins => cur_min + dur)) AT TIME ZONE b_tz;

      IF v_start < lead_cutoff THEN
        cur_min := cur_min + step_min;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.business_closures c
        WHERE c.business_id = p_business_id
          AND c.start_at < v_end
          AND c.end_at > v_start
      ) THEN
        cur_min := cur_min + step_min;
        CONTINUE;
      END IF;

      IF p_staff_id IS NOT NULL THEN
        IF EXISTS (
          SELECT 1
          FROM public.staff_closures sc
          WHERE sc.staff_id = p_staff_id
            AND sc.start_at < v_end
            AND sc.end_at > v_start
        ) THEN
          cur_min := cur_min + step_min;
          CONTINUE;
        END IF;
      END IF;

      actual_start := v_start - make_interval(mins => buf_bef);
      actual_end := v_end + make_interval(mins => buf_aft);

      SELECT EXISTS (
        SELECT 1
        FROM public.bookings bk
        WHERE bk.business_id = p_business_id
          AND bk.status IN (
            'requested',
            'pending_approval',
            'pending_deposit',
            'requires_deposit',
            'pending_payment_setup',
            'confirmed',
            'change_proposed',
            'completed',
            'no_show',
            'late_cancel'
          )
          AND (p_staff_id IS NULL OR bk.staff_id = p_staff_id)
          AND bk.start_at < actual_end
          AND bk.end_at > actual_start
      )
      INTO overlap_booking;

      IF overlap_booking AND NOT b_allow_ob THEN
        cur_min := cur_min + step_min;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.blocked_slots bs
        WHERE bs.business_id = p_business_id
          AND (bs.staff_id IS NULL OR bs.staff_id = p_staff_id)
          AND bs.start_at < actual_end
          AND bs.end_at > actual_start
      ) THEN
        cur_min := cur_min + step_min;
        CONTINUE;
      END IF;

      start_at := v_start;
      end_at := v_end;
      RETURN NEXT;

      cur_min := cur_min + step_min;
    END LOOP;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.list_bookable_slots_for_booking(uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_bookable_slots_for_booking(uuid, uuid, date, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.list_bookable_slots_for_booking(uuid, uuid, date, uuid) TO authenticated;
