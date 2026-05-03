-- booking_integrity_assertions.sql
-- Fail-fast integrity checks for booking domain data and DB guards.

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'bookings'
    and t.tgname = 'bookings_no_overlap_guard'
    and not t.tgisinternal;

  if v_count = 0 then
    raise exception 'booking_integrity_failed: bookings_no_overlap_guard trigger missing.';
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.services s
  where coalesce(s.duration_min, 0) <= 0;

  if v_count > 0 then
    raise exception 'booking_integrity_failed: invalid service duration rows (%).', v_count;
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.bookings b
  where b.end_at <= b.start_at;

  if v_count > 0 then
    raise exception 'booking_integrity_failed: bookings with invalid interval (%).', v_count;
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.bookings b1
  join public.bookings b2
    on b1.business_id = b2.business_id
   and b1.id < b2.id
   and tstzrange(b1.start_at, b1.end_at, '[)') && tstzrange(b2.start_at, b2.end_at, '[)')
  left join public.business_booking_ecosystem e
    on e.business_id = b1.business_id
  where b1.status in (
      'requested', 'pending_approval', 'pending_deposit', 'requires_deposit', 'pending_payment_setup',
      'confirmed', 'change_proposed', 'completed', 'no_show', 'late_cancel'
    )
    and b2.status in (
      'requested', 'pending_approval', 'pending_deposit', 'requires_deposit', 'pending_payment_setup',
      'confirmed', 'change_proposed', 'completed', 'no_show', 'late_cancel'
    )
    and not (
      coalesce(e.resource_management_enabled, false) = true
      and coalesce(e.booking_vertical, 'service') in ('hospitality_table', 'seat_assignment')
    )
    and (
      (b1.staff_id is null and b2.staff_id is null)
      or (b1.staff_id is not null and b1.staff_id = b2.staff_id)
    );

  if v_count > 0 then
    raise exception 'booking_integrity_failed: overlapping active bookings detected (% pairs).', v_count;
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.booking_resource_assignments a1
  join public.booking_resource_assignments a2
    on a1.primary_resource_id = a2.primary_resource_id
   and a1.booking_id < a2.booking_id
  join public.bookings b1 on b1.id = a1.booking_id
  join public.bookings b2 on b2.id = a2.booking_id
  where a1.primary_resource_id is not null
    and b1.business_id = b2.business_id
    and b1.status in (
      'requested', 'pending_approval', 'pending_deposit', 'requires_deposit', 'pending_payment_setup',
      'confirmed', 'change_proposed', 'completed', 'no_show', 'late_cancel'
    )
    and b2.status in (
      'requested', 'pending_approval', 'pending_deposit', 'requires_deposit', 'pending_payment_setup',
      'confirmed', 'change_proposed', 'completed', 'no_show', 'late_cancel'
    )
    and tstzrange(b1.start_at, b1.end_at, '[)') && tstzrange(b2.start_at, b2.end_at, '[)');

  if v_count > 0 then
    raise exception 'booking_integrity_failed: overlapping bookings share the same primary_resource_id (% pairs).', v_count;
  end if;
end
$$;

-- Il trigger overlap deve includere gli stati caparra/pagamento setup (coerenza con create_booking_v3).
do $$
declare
  fn text;
begin
  select pg_get_functiondef(p.oid)::text
  into fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ensure_booking_no_overlap'
    and p.pronargs = 0
  limit 1;

  if fn is null or fn not like '%requires_deposit%' or fn not like '%pending_payment_setup%' then
    raise exception 'booking_integrity_failed: ensure_booking_no_overlap out of sync with booking engine statuses.';
  end if;
end
$$;

do $$
declare
  fn text;
begin
  select pg_get_functiondef('public.apply_reliability_delta(uuid, uuid, text, integer)'::regprocedure)
  into fn;

  if fn not like '%on conflict (user_id, booking_id, kind) do nothing%' then
    raise exception 'booking_integrity_failed: apply_reliability_delta not idempotent on reliability_events.';
  end if;

  if fn not like '%invalid_booking_state%' then
    raise exception 'booking_integrity_failed: apply_reliability_delta missing booking state guard.';
  end if;

  if fn not like '%business_review_missing%' then
    raise exception 'booking_integrity_failed: apply_reliability_delta missing business review proof guard.';
  end if;

  if fn not like '%invalid_cancel_kind%' then
    raise exception 'booking_integrity_failed: apply_reliability_delta missing cancel-kind guard.';
  end if;
end
$$;

do $$
declare
  v_qual text;
begin
  select coalesce(qual::text, '')
  into v_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'booking_messages'
    and policyname = 'booking_messages_select_participant'
  limit 1;

  if v_qual = '' then
    raise exception 'booking_integrity_failed: booking_messages_select_participant policy missing.';
  end if;

  if v_qual not like '%is_business_member%' then
    raise exception 'booking_integrity_failed: booking_messages policy not aligned with business-member access.';
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'notifications'
    and t.tgname = 'notifications_guard_update'
    and not t.tgisinternal;

  if v_count = 0 then
    raise exception 'booking_integrity_failed: notifications_guard_update trigger missing.';
  end if;
end
$$;

select 'booking_integrity_assertions_passed' as result;
