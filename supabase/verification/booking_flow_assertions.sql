-- booking_flow_assertions.sql
-- Fail-fast checks for booking flow hardening (timezone + opening-hours + guardrails).

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'businesses'
    and column_name = 'timezone';

  if v_count = 0 then
    raise exception 'booking_flow_assertion_failed: businesses.timezone column missing.';
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'businesses'
    and c.conname = 'businesses_timezone_valid';

  if v_count = 0 then
    raise exception 'booking_flow_assertion_failed: businesses_timezone_valid constraint missing.';
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from public.businesses b
  where b.timezone is null
     or btrim(b.timezone) = ''
     or not public.is_valid_iana_timezone(b.timezone);

  if v_count > 0 then
    raise exception 'booking_flow_assertion_failed: invalid timezone values in businesses (%).', v_count;
  end if;
end
$$;

do $$
declare
  fn_def text;
begin
  select pg_get_functiondef(p.oid)
  into fn_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_booking_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_business_id uuid, p_service_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone';

  if fn_def is null then
    raise exception 'booking_flow_assertion_failed: create_booking_v2 not found.';
  end if;

  if position('outside_opening_hours' in fn_def) = 0 then
    raise exception 'booking_flow_assertion_failed: create_booking_v2 missing outside_opening_hours guard.';
  end if;
  if position('business_closed' in fn_def) = 0 then
    raise exception 'booking_flow_assertion_failed: create_booking_v2 missing business_closed guard.';
  end if;
  if position('booking_lead_time_min' in fn_def) = 0 then
    raise exception 'booking_flow_assertion_failed: create_booking_v2 missing lead-time guard.';
  end if;
  if position('business_opening_windows' in fn_def) = 0 then
    raise exception 'booking_flow_assertion_failed: create_booking_v2 missing opening-window guard.';
  end if;
  if position('compute_deposit_cents_v2' in fn_def) = 0 then
    raise exception 'booking_flow_assertion_failed: create_booking_v2 missing deposit engine call.';
  end if;
  if position('requires_deposit' in fn_def) = 0 then
    raise exception 'booking_flow_assertion_failed: create_booking_v2 missing requires_deposit status handling.';
  end if;
end
$$;

select 'booking_flow_assertions_passed' as result;
