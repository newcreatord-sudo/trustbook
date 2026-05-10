-- AI director: lettura agenda e mutazioni prenotazione (owner + flag ecosistema), con audit opzionale su agent_id.

alter table public.business_booking_ecosystem
  add column if not exists ai_booking_operator_enabled boolean not null default false;

comment on column public.business_booking_ecosystem.ai_booking_operator_enabled is
  'When true, HTTP AI tools may list bookings and apply staff-side booking actions for the business (RPC ai_* booking operator).';

-- ---------------------------------------------------------------------------
-- List: prenotazioni con start_at in [p_from, p_to)
-- ---------------------------------------------------------------------------
create or replace function public.ai_list_business_bookings(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 100,
  p_statuses text[] default null,
  p_agent_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent text;
  v_lim int;
  j jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid_time_range';
  end if;

  v_agent := nullif(trim(coalesce(p_agent_id, '')), '');
  if v_agent is not null then
    if not exists (
      select 1 from public.business_booking_ecosystem e
      where e.business_id = p_business_id and e.ai_booking_operator_enabled = true
    ) then
      raise exception 'ai_booking_operator_disabled';
    end if;
  end if;

  v_lim := greatest(1, least(coalesce(p_limit, 100), 200));

  select coalesce(
    jsonb_agg(to_jsonb(b) order by b.start_at asc),
    '[]'::jsonb
  )
  into j
  from (
    select *
    from public.bookings b
    where b.business_id = p_business_id
      and b.start_at >= p_from
      and b.start_at < p_to
      and (
        p_statuses is null
        or array_length(p_statuses, 1) is null
        or b.status::text = any (p_statuses)
      )
    order by b.start_at asc
    limit v_lim
  ) b;

  return j;
end;
$$;

revoke all on function public.ai_list_business_bookings(uuid, timestamptz, timestamptz, int, text[], text) from public;
grant execute on function public.ai_list_business_bookings(uuid, timestamptz, timestamptz, int, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Detail singola prenotazione
-- ---------------------------------------------------------------------------
create or replace function public.ai_get_business_booking(
  p_business_id uuid,
  p_booking_id uuid,
  p_agent_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent text;
  bk public.bookings;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  v_agent := nullif(trim(coalesce(p_agent_id, '')), '');
  if v_agent is not null then
    if not exists (
      select 1 from public.business_booking_ecosystem e
      where e.business_id = p_business_id and e.ai_booking_operator_enabled = true
    ) then
      raise exception 'ai_booking_operator_disabled';
    end if;
  end if;

  select * into bk from public.bookings where id = p_booking_id;
  if bk is null or bk.business_id <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_get_business_booking(uuid, uuid, text) from public;
grant execute on function public.ai_get_business_booking(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: gate scrittura operatore + log
-- ---------------------------------------------------------------------------
create or replace function public.ai_booking_operator_mutate_precheck(
  p_business_id uuid,
  p_agent_id text,
  p_require_agent_for_gate boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  v_agent := nullif(trim(coalesce(p_agent_id, '')), '');

  if p_require_agent_for_gate or v_agent is not null then
    if v_agent is null then
      raise exception 'agent_id_required';
    end if;
    if not exists (
      select 1 from public.business_booking_ecosystem e
      where e.business_id = p_business_id and e.ai_booking_operator_enabled = true
    ) then
      raise exception 'ai_booking_operator_disabled';
    end if;
  end if;

  return v_agent;
end;
$$;

revoke all on function public.ai_booking_operator_mutate_precheck(uuid, text, boolean) from public;

-- Mutations: richiedono sempre agent_id non vuoto (strumenti director)
create or replace function public.ai_approve_booking_request(
  p_business_id uuid,
  p_booking_id uuid,
  p_agent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  bk public.bookings;
  eff int;
  dep int;
  next_status public.booking_status;
  dep_st public.deposit_status;
begin
  v_agent := public.ai_booking_operator_mutate_precheck(p_business_id, p_agent_id, true);

  select * into bk from public.bookings where id = p_booking_id for update;
  if bk is null or bk.business_id <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  if bk.status not in ('requested', 'pending_approval') then
    raise exception 'approve_not_allowed_for_status';
  end if;

  eff := public.effective_reliability_score(bk.customer_user_id);
  select d.deposit_amount_cents
  into dep
  from public.compute_deposit_cents_v2(p_business_id, bk.service_id, eff) d;

  dep := coalesce(dep, 0);

  dep_st := case when dep > 0 then 'required'::public.deposit_status else 'not_required'::public.deposit_status end;
  if dep > 0 then
    next_status := 'requires_deposit'::public.booking_status;
  else
    next_status := 'confirmed'::public.booking_status;
  end if;

  update public.bookings
  set
    status = next_status,
    deposit_amount_cents = dep,
    deposit_status = dep_st,
    approved_by_user_id = auth.uid(),
    confirmed_at = case
      when next_status = 'confirmed' then coalesce(bookings.confirmed_at, now())
      else bookings.confirmed_at
    end,
    updated_at = now()
  where id = p_booking_id
  returning * into bk;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_approve_booking_request',
      jsonb_build_object('booking_id', p_booking_id, 'next_status', next_status, 'deposit_cents', dep),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_approve_booking_request(uuid, uuid, text) from public;
grant execute on function public.ai_approve_booking_request(uuid, uuid, text) to authenticated;

create or replace function public.ai_reject_booking_request(
  p_business_id uuid,
  p_booking_id uuid,
  p_rejection_reason text default null,
  p_agent_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  bk public.bookings;
  reason text;
begin
  v_agent := public.ai_booking_operator_mutate_precheck(p_business_id, p_agent_id, true);

  select * into bk from public.bookings where id = p_booking_id for update;
  if bk is null or bk.business_id <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  if bk.status not in ('requested', 'pending_approval') then
    raise exception 'reject_not_allowed_for_status';
  end if;

  reason := nullif(trim(coalesce(p_rejection_reason, '')), '');

  update public.bookings
  set
    status = 'rejected'::public.booking_status,
    rejected_by_user_id = auth.uid(),
    rejection_reason = reason,
    cancelled_at = coalesce(bookings.cancelled_at, now()),
    updated_at = now()
  where id = p_booking_id
  returning * into bk;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_reject_booking_request',
      jsonb_build_object('booking_id', p_booking_id, 'rejection_reason', reason),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_reject_booking_request(uuid, uuid, text, text) from public;
grant execute on function public.ai_reject_booking_request(uuid, uuid, text, text) to authenticated;

create or replace function public.ai_apply_booking_reschedule(
  p_business_id uuid,
  p_booking_id uuid,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz,
  p_agent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  bk public.bookings;
  b_business uuid;
begin
  v_agent := public.ai_booking_operator_mutate_precheck(p_business_id, p_agent_id, true);

  select business_id into b_business from public.bookings where id = p_booking_id;
  if b_business is null or b_business <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  select * into bk from public.business_reschedule_booking_apply(p_booking_id, p_new_start_at, p_new_end_at);

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_apply_booking_reschedule',
      jsonb_build_object(
        'booking_id', p_booking_id,
        'new_start_at', p_new_start_at,
        'new_end_at', p_new_end_at
      ),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_apply_booking_reschedule(uuid, uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.ai_apply_booking_reschedule(uuid, uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.ai_propose_booking_reschedule(
  p_business_id uuid,
  p_booking_id uuid,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz,
  p_message text default null,
  p_agent_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  bk public.bookings;
  b_business uuid;
begin
  v_agent := public.ai_booking_operator_mutate_precheck(p_business_id, p_agent_id, true);

  select business_id into b_business from public.bookings where id = p_booking_id;
  if b_business is null or b_business <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  select * into bk from public.business_propose_booking_reschedule(p_booking_id, p_new_start_at, p_new_end_at, p_message);

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_propose_booking_reschedule',
      jsonb_build_object(
        'booking_id', p_booking_id,
        'new_start_at', p_new_start_at,
        'new_end_at', p_new_end_at
      ),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_propose_booking_reschedule(uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.ai_propose_booking_reschedule(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;

create or replace function public.ai_accept_booking_time_proposal(
  p_business_id uuid,
  p_booking_id uuid,
  p_agent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  bid uuid;
  bk public.bookings;
begin
  v_agent := public.ai_booking_operator_mutate_precheck(p_business_id, p_agent_id, true);

  select business_id into bid from public.bookings where id = p_booking_id;
  if bid is null or bid <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  select * into bk from public.accept_booking_time_proposal(p_booking_id);

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_accept_booking_time_proposal',
      jsonb_build_object('booking_id', p_booking_id),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_accept_booking_time_proposal(uuid, uuid, text) from public;
grant execute on function public.ai_accept_booking_time_proposal(uuid, uuid, text) to authenticated;

create or replace function public.ai_reject_booking_time_proposal(
  p_business_id uuid,
  p_booking_id uuid,
  p_agent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  bid uuid;
  bk public.bookings;
begin
  v_agent := public.ai_booking_operator_mutate_precheck(p_business_id, p_agent_id, true);

  select business_id into bid from public.bookings where id = p_booking_id;
  if bid is null or bid <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  select * into bk from public.reject_booking_time_proposal(p_booking_id);

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_reject_booking_time_proposal',
      jsonb_build_object('booking_id', p_booking_id),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_reject_booking_time_proposal(uuid, uuid, text) from public;
grant execute on function public.ai_reject_booking_time_proposal(uuid, uuid, text) to authenticated;

create or replace function public.ai_complete_booking(
  p_business_id uuid,
  p_booking_id uuid,
  p_agent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  bk public.bookings;
begin
  v_agent := public.ai_booking_operator_mutate_precheck(p_business_id, p_agent_id, true);

  select * into bk from public.bookings where id = p_booking_id for update;
  if bk is null or bk.business_id <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  if bk.status <> 'confirmed' then
    raise exception 'complete_not_allowed_for_status';
  end if;

  update public.bookings
  set
    status = 'completed'::public.booking_status,
    completed_at = coalesce(bookings.completed_at, now()),
    updated_at = now()
  where id = p_booking_id
  returning * into bk;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_complete_booking',
      jsonb_build_object('booking_id', p_booking_id),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_complete_booking(uuid, uuid, text) from public;
grant execute on function public.ai_complete_booking(uuid, uuid, text) to authenticated;

create or replace function public.ai_mark_booking_no_show(
  p_business_id uuid,
  p_booking_id uuid,
  p_agent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  bk public.bookings;
  next_dep public.deposit_status;
begin
  v_agent := public.ai_booking_operator_mutate_precheck(p_business_id, p_agent_id, true);

  select * into bk from public.bookings where id = p_booking_id for update;
  if bk is null or bk.business_id <> p_business_id then
    raise exception 'booking_not_found';
  end if;

  if bk.status <> 'confirmed' then
    raise exception 'no_show_not_allowed_for_status';
  end if;

  next_dep := case
    when bk.deposit_status = 'paid'::public.deposit_status then 'forfeited'::public.deposit_status
    else bk.deposit_status
  end;

  update public.bookings
  set
    status = 'no_show'::public.booking_status,
    no_show_at = coalesce(bookings.no_show_at, now()),
    deposit_status = next_dep,
    updated_at = now()
  where id = p_booking_id
  returning * into bk;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_mark_booking_no_show',
      jsonb_build_object('booking_id', p_booking_id, 'deposit_status', next_dep::text),
      jsonb_build_object('status', 'ok', 'stripe_forfeit_note', 'call /api/stripe/deposit/forfeit-by-business when deposit was paid'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return to_jsonb(bk);
end;
$$;

revoke all on function public.ai_mark_booking_no_show(uuid, uuid, text) from public;
grant execute on function public.ai_mark_booking_no_show(uuid, uuid, text) to authenticated;
