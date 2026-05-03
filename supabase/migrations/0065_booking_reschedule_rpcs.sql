-- Ripianificazione appuntamenti solo tramite RPC (validazione slot allineata a create_booking_v3).
-- Agenti esterni / AI devono chiamare queste funzioni, non aggiornare bookings direttamente.

create or replace function public.internal_validate_booking_slot_interval(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_ignore_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  svc record;
  req_duration_min int;
  local_start timestamp;
  local_end timestamp;
  local_weekday int;
  actual_start_at timestamptz;
  actual_end_at timestamptz;
begin
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'invalid_booking_interval';
  end if;

  select
    id,
    is_paused,
    booking_lead_time_min,
    timezone,
    allow_overbooking
  into b
  from public.businesses
  where id = p_business_id;

  if b is null then
    raise exception 'business_not_found';
  end if;
  if coalesce(b.is_paused, false) then
    raise exception 'business_paused';
  end if;

  req_duration_min := floor(extract(epoch from (p_end_at - p_start_at)) / 60)::int;
  if req_duration_min <= 0 then
    raise exception 'invalid_duration';
  end if;

  select id, duration_min, is_active, buffer_before_min, buffer_after_min
  into svc
  from public.services
  where id = p_service_id
    and business_id = p_business_id;

  if svc is null then
    raise exception 'service_not_found';
  end if;
  if coalesce(svc.is_active, false) is not true then
    raise exception 'service_inactive';
  end if;
  if coalesce(svc.duration_min, 0) <= 0 or req_duration_min <> svc.duration_min then
    raise exception 'invalid_duration';
  end if;

  if p_start_at < now() + make_interval(mins => greatest(0, coalesce(b.booking_lead_time_min, 0))) then
    raise exception 'lead_time_not_respected';
  end if;

  local_start := p_start_at at time zone coalesce(b.timezone, 'Europe/Rome');
  local_end := p_end_at at time zone coalesce(b.timezone, 'Europe/Rome');
  local_weekday := extract(dow from local_start)::int;

  if local_end::date <> local_start::date then
    raise exception 'outside_opening_hours';
  end if;

  if not exists (
    select 1
    from public.business_opening_windows w
    where w.business_id = p_business_id
      and w.weekday = local_weekday
      and w.start_time <= local_start::time
      and w.end_time >= local_end::time
  ) then
    raise exception 'outside_opening_hours';
  end if;

  if exists (
    select 1
    from public.business_closures c
    where c.business_id = p_business_id
      and c.start_at < p_end_at
      and c.end_at > p_start_at
  ) then
    raise exception 'business_closed';
  end if;

  if p_staff_id is not null then
    if not exists (
      select 1 from public.team_members
      where id = p_staff_id and business_id = p_business_id and coalesce(is_bookable, true) = true
    ) then
      raise exception 'staff_unavailable';
    end if;

    if exists (
      select 1 from public.staff_closures c
      where c.staff_id = p_staff_id
        and c.start_at < p_end_at
        and c.end_at > p_start_at
    ) then
      raise exception 'staff_unavailable';
    end if;
  end if;

  actual_start_at := p_start_at - make_interval(mins => coalesce(svc.buffer_before_min, 0));
  actual_end_at := p_end_at + make_interval(mins => coalesce(svc.buffer_after_min, 0));

  if exists (
    select 1 from public.bookings bk
    where bk.business_id = p_business_id
      and bk.id <> coalesce(p_ignore_booking_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and bk.status in (
        'requested', 'pending_approval', 'pending_deposit', 'requires_deposit', 'pending_payment_setup',
        'confirmed', 'change_proposed', 'completed', 'no_show', 'late_cancel'
      )
      and (p_staff_id is null or bk.staff_id = p_staff_id)
      and bk.start_at < actual_end_at
      and bk.end_at > actual_start_at
  ) then
    if not coalesce(b.allow_overbooking, false) then
      raise exception 'slot_unavailable';
    end if;
  end if;

  if exists (
    select 1 from public.blocked_slots bs
    where bs.business_id = p_business_id
      and (bs.staff_id is null or bs.staff_id = p_staff_id)
      and bs.start_at < actual_end_at
      and bs.end_at > actual_start_at
  ) then
    raise exception 'slot_unavailable';
  end if;
end;
$$;

revoke all on function public.internal_validate_booking_slot_interval(uuid, uuid, uuid, timestamptz, timestamptz, uuid) from public;

-- Applicazione diretta nuovo slot (senza stato change_proposed). Solo membri team attività.
create or replace function public.business_reschedule_booking_apply(
  p_booking_id uuid,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into bk
  from public.bookings
  where id = p_booking_id
  for update;

  if bk is null then
    raise exception 'booking_not_found';
  end if;

  if not public.is_business_member(bk.business_id) then
    raise exception 'member_only';
  end if;

  if bk.status not in (
    'confirmed', 'pending_deposit', 'requires_deposit', 'pending_payment_setup', 'pending_approval', 'requested'
  ) then
    raise exception 'reschedule_not_allowed_for_status';
  end if;

  perform public.internal_validate_booking_slot_interval(
    bk.business_id,
    bk.service_id,
    bk.staff_id,
    p_new_start_at,
    p_new_end_at,
    bk.id
  );

  update public.bookings
  set
    start_at = p_new_start_at,
    end_at = p_new_end_at,
    proposed_start_at = null,
    proposed_end_at = null,
    proposed_by_role = null,
    proposal_message = null,
    proposal_created_at = null,
    updated_at = now()
  where id = p_booking_id
  returning * into bk;

  return bk;
end;
$$;

revoke all on function public.business_reschedule_booking_apply(uuid, timestamptz, timestamptz) from public;
grant execute on function public.business_reschedule_booking_apply(uuid, timestamptz, timestamptz) to authenticated;

-- Proposta cambio orario (attività → cliente): solo campi proposal + stato.
create or replace function public.business_propose_booking_reschedule(
  p_booking_id uuid,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz,
  p_message text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into bk
  from public.bookings
  where id = p_booking_id
  for update;

  if bk is null then
    raise exception 'booking_not_found';
  end if;

  if not public.is_business_member(bk.business_id) then
    raise exception 'member_only';
  end if;

  if bk.status not in (
    'confirmed', 'pending_deposit', 'requires_deposit', 'pending_payment_setup', 'pending_approval', 'requested'
  ) then
    raise exception 'propose_not_allowed_for_status';
  end if;

  perform public.internal_validate_booking_slot_interval(
    bk.business_id,
    bk.service_id,
    bk.staff_id,
    p_new_start_at,
    p_new_end_at,
    bk.id
  );

  update public.bookings
  set
    status = 'change_proposed'::public.booking_status,
    proposed_start_at = p_new_start_at,
    proposed_end_at = p_new_end_at,
    proposed_by_role = 'attivita'::public.user_role,
    proposal_message = nullif(trim(coalesce(p_message, '')), ''),
    proposal_created_at = now(),
    updated_at = now()
  where id = p_booking_id
  returning * into bk;

  return bk;
end;
$$;

revoke all on function public.business_propose_booking_reschedule(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.business_propose_booking_reschedule(uuid, timestamptz, timestamptz, text) to authenticated;

-- Accetta proposta cambio orario (cliente ↔ attività), con permessi incrociati.
create or replace function public.accept_booking_time_proposal(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
  uid uuid;
  deposit_required boolean;
  new_status public.booking_status;
  now_ts timestamptz := now();
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into bk
  from public.bookings
  where id = p_booking_id
  for update;

  if bk is null then
    raise exception 'booking_not_found';
  end if;

  if bk.status <> 'change_proposed' then
    raise exception 'proposal_not_pending';
  end if;

  if bk.proposed_start_at is null or bk.proposed_end_at is null then
    raise exception 'proposal_missing_times';
  end if;

  perform public.internal_validate_booking_slot_interval(
    bk.business_id,
    bk.service_id,
    bk.staff_id,
    bk.proposed_start_at,
    bk.proposed_end_at,
    bk.id
  );

  deposit_required := coalesce(bk.deposit_amount_cents, 0) > 0 and bk.deposit_status is distinct from 'paid';

  if uid = bk.customer_user_id then
    if bk.proposed_by_role is distinct from 'attivita' then
      raise exception 'proposal_actor_mismatch';
    end if;
    new_status := case when deposit_required then 'requires_deposit'::public.booking_status else 'confirmed'::public.booking_status end;
  elsif public.is_business_member(bk.business_id) then
    if bk.proposed_by_role is distinct from 'cliente' then
      raise exception 'proposal_actor_mismatch';
    end if;
    new_status := case when deposit_required then 'pending_deposit'::public.booking_status else 'confirmed'::public.booking_status end;
  else
    raise exception 'not_authorized';
  end if;

  update public.bookings
  set
    start_at = bk.proposed_start_at,
    end_at = bk.proposed_end_at,
    proposed_start_at = null,
    proposed_end_at = null,
    proposed_by_role = null,
    proposal_message = null,
    proposal_created_at = null,
    status = new_status,
    confirmed_at = case
      when new_status = 'confirmed' then coalesce(bk.confirmed_at, now_ts)
      else null
    end,
    updated_at = now_ts
  where id = p_booking_id
  returning * into bk;

  return bk;
end;
$$;

revoke all on function public.accept_booking_time_proposal(uuid) from public;
grant execute on function public.accept_booking_time_proposal(uuid) to authenticated;

-- Rifiuta proposta (ripristino stato precedente approssimativo basato su caparra).
create or replace function public.reject_booking_time_proposal(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
  uid uuid;
  deposit_required boolean;
  new_status public.booking_status;
  now_ts timestamptz := now();
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into bk
  from public.bookings
  where id = p_booking_id
  for update;

  if bk is null then
    raise exception 'booking_not_found';
  end if;

  if bk.status <> 'change_proposed' then
    raise exception 'proposal_not_pending';
  end if;

  deposit_required := coalesce(bk.deposit_amount_cents, 0) > 0 and bk.deposit_status is distinct from 'paid';

  if uid = bk.customer_user_id then
    if bk.proposed_by_role is distinct from 'attivita' then
      raise exception 'proposal_actor_mismatch';
    end if;
    new_status := case when deposit_required then 'requires_deposit'::public.booking_status else 'confirmed'::public.booking_status end;
  elsif public.is_business_member(bk.business_id) then
    if bk.proposed_by_role is distinct from 'cliente' then
      raise exception 'proposal_actor_mismatch';
    end if;
    new_status := case when deposit_required then 'pending_deposit'::public.booking_status else 'confirmed'::public.booking_status end;
  else
    raise exception 'not_authorized';
  end if;

  update public.bookings
  set
    proposed_start_at = null,
    proposed_end_at = null,
    proposed_by_role = null,
    proposal_message = null,
    proposal_created_at = null,
    status = new_status,
    updated_at = now_ts
  where id = p_booking_id
  returning * into bk;

  return bk;
end;
$$;

revoke all on function public.reject_booking_time_proposal(uuid) from public;
grant execute on function public.reject_booking_time_proposal(uuid) to authenticated;

-- Cliente propone nuovo slot (mirror validazione server-side).
create or replace function public.customer_propose_booking_reschedule(
  p_booking_id uuid,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz,
  p_message text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into bk
  from public.bookings
  where id = p_booking_id
  for update;

  if bk is null then
    raise exception 'booking_not_found';
  end if;

  if auth.uid() <> bk.customer_user_id then
    raise exception 'customer_only';
  end if;

  if bk.status not in (
    'confirmed', 'pending_deposit', 'requires_deposit', 'pending_payment_setup'
  ) then
    raise exception 'propose_not_allowed_for_status';
  end if;

  perform public.internal_validate_booking_slot_interval(
    bk.business_id,
    bk.service_id,
    bk.staff_id,
    p_new_start_at,
    p_new_end_at,
    bk.id
  );

  update public.bookings
  set
    status = 'change_proposed'::public.booking_status,
    proposed_start_at = p_new_start_at,
    proposed_end_at = p_new_end_at,
    proposed_by_role = 'cliente'::public.user_role,
    proposal_message = nullif(trim(coalesce(p_message, '')), ''),
    proposal_created_at = now(),
    updated_at = now()
  where id = p_booking_id
  returning * into bk;

  return bk;
end;
$$;

revoke all on function public.customer_propose_booking_reschedule(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.customer_propose_booking_reschedule(uuid, timestamptz, timestamptz, text) to authenticated;
