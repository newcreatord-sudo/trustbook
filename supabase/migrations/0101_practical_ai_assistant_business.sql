-- Practical AI Assistant (deterministic-first): suggestion lifecycle + new action types.

do $$
declare
  c record;
begin
  -- Drop old inline CHECK constraint for status (name differs across environments).
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.ai_suggestions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status in%'
  loop
    execute format('alter table public.ai_suggestions drop constraint if exists %I', c.conname);
  end loop;
end
$$;

alter table public.ai_suggestions
  drop constraint if exists ai_suggestions_status_check;

alter table public.ai_suggestions
  add column if not exists read_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by_user_id uuid references auth.users(id) on delete set null;

update public.ai_suggestions
set status = 'new'
where status = 'active';

alter table public.ai_suggestions
  alter column status set default 'new';

alter table public.ai_suggestions
  add constraint ai_suggestions_status_check
  check (status in ('new','read','applied','dismissed'));

create index if not exists ai_suggestions_business_status_generated_idx
on public.ai_suggestions (business_id, status, generated_at desc);

create or replace function public.mark_ai_suggestion_read(p_suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  now_ts timestamptz := now();
begin
  select * into s from public.ai_suggestions where id = p_suggestion_id;
  if s is null then
    raise exception 'suggestion_not_found';
  end if;
  if not public.is_business_owner(s.business_id) then
    raise exception 'owner_only';
  end if;
  if s.status not in ('new','read') then
    return;
  end if;

  update public.ai_suggestions
  set status = 'read',
      read_at = coalesce(read_at, now_ts)
  where id = p_suggestion_id;

  insert into public.ai_suggestion_audit (suggestion_id, business_id, user_id, action_type, action_payload, result)
  values (p_suggestion_id, s.business_id, auth.uid(), 'MARK_READ', '{}'::jsonb, 'success');
end
$$;

revoke all on function public.mark_ai_suggestion_read(uuid) from public;
grant execute on function public.mark_ai_suggestion_read(uuid) to authenticated;

create or replace function public.dismiss_ai_suggestion(p_suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  now_ts timestamptz := now();
begin
  select * into s from public.ai_suggestions where id = p_suggestion_id;
  if s is null then
    raise exception 'suggestion_not_found';
  end if;
  if not public.is_business_owner(s.business_id) then
    raise exception 'owner_only';
  end if;
  if s.status = 'dismissed' then
    return;
  end if;
  if s.status = 'applied' then
    raise exception 'cannot_dismiss_applied';
  end if;

  update public.ai_suggestions
  set status = 'dismissed',
      dismissed_at = now_ts,
      dismissed_by_user_id = auth.uid()
  where id = p_suggestion_id;

  insert into public.ai_suggestion_audit (suggestion_id, business_id, user_id, action_type, action_payload, result)
  values (p_suggestion_id, s.business_id, auth.uid(), 'DISMISS', '{}'::jsonb, 'success');
end
$$;

revoke all on function public.dismiss_ai_suggestion(uuid) from public;
grant execute on function public.dismiss_ai_suggestion(uuid) to authenticated;

-- Extend apply_ai_suggestion: allow status new/read and add safe actions (descriptions + extra reminder).
create or replace function public.apply_ai_suggestion(
  p_suggestion_id uuid,
  p_skip_agent_execution_log boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  now_ts timestamptz;
  v_service_id uuid;
  v_new_price int;
  v_min_gap int;
  v_deposit_enabled boolean;
  v_deposit_rule text;
  v_deposit_percent int;
  v_deposit_fixed int;
  v_deposit_min int;
  v_deposit_max int;
  v_approval_mode text;
  v_customer_id uuid;
  v_tag text;
  v_note text;
  cur_block int;
  cur_auto int;
  v_block_thr int;
  v_auto_ns int;
  v_desc text;
  v_booking_id uuid;
  v_kind text;
  v_deliver_at timestamptz;
  b record;
  epoch bigint;
begin
  now_ts := now();

  select * into s
  from public.ai_suggestions
  where id = p_suggestion_id;

  if s is null then
    raise exception 'suggestion_not_found';
  end if;

  if s.status not in ('new','read') then
    raise exception 'suggestion_not_active';
  end if;

  if not public.is_business_owner(s.business_id) then
    raise exception 'owner_only';
  end if;

  begin
    if s.action_type = 'UPDATE_SERVICE_PRICE' then
      v_service_id := nullif((s.action_payload->>'service_id')::text, '')::uuid;
      v_new_price := greatest(0, (s.action_payload->>'new_price_cents')::int);
      update public.services
      set price_cents = v_new_price, updated_at = now_ts
      where id = v_service_id and business_id = s.business_id;
      if not found then
        raise exception 'service_not_found';
      end if;

    elsif s.action_type = 'UPDATE_SERVICE_DESCRIPTION' then
      v_service_id := nullif((s.action_payload->>'service_id')::text, '')::uuid;
      v_desc := left(coalesce(s.action_payload->>'description', ''), 2000);
      update public.services
      set description = nullif(trim(v_desc), ''), updated_at = now_ts
      where id = v_service_id and business_id = s.business_id;
      if not found then
        raise exception 'service_not_found';
      end if;

    elsif s.action_type = 'UPDATE_BUSINESS_DESCRIPTION' then
      v_desc := left(coalesce(s.action_payload->>'description', ''), 4000);
      update public.businesses
      set description = nullif(trim(v_desc), ''), updated_at = now_ts
      where id = s.business_id;

    elsif s.action_type = 'UPDATE_BUSINESS_DEPOSIT' then
      v_deposit_enabled := coalesce((s.action_payload->>'deposit_enabled')::boolean, true);
      v_deposit_rule := coalesce(nullif(s.action_payload->>'deposit_rule', ''), 'all');
      v_deposit_percent := nullif(s.action_payload->>'deposit_percent', '')::int;
      v_deposit_fixed := nullif(s.action_payload->>'deposit_fixed_cents', '')::int;
      v_deposit_min := nullif(s.action_payload->>'deposit_min_cents', '')::int;
      v_deposit_max := nullif(s.action_payload->>'deposit_max_cents', '')::int;
      update public.businesses
      set
        deposit_enabled = v_deposit_enabled,
        deposit_rule = v_deposit_rule::deposit_rule,
        deposit_percent = v_deposit_percent,
        deposit_fixed_cents = v_deposit_fixed,
        deposit_min_cents = v_deposit_min,
        deposit_max_cents = v_deposit_max,
        updated_at = now_ts
      where id = s.business_id;

    elsif s.action_type = 'UPDATE_BUSINESS_APPROVAL_MODE' then
      v_approval_mode := coalesce(nullif(s.action_payload->>'approval_mode', ''), 'manual');
      update public.businesses
      set approval_mode = v_approval_mode::approval_mode, updated_at = now_ts
      where id = s.business_id;

    elsif s.action_type = 'UPDATE_BUSINESS_MIN_GAP' then
      v_min_gap := greatest(0, (s.action_payload->>'min_gap_min')::int);
      update public.businesses
      set min_gap_min = v_min_gap, updated_at = now_ts
      where id = s.business_id;

    elsif s.action_type = 'UPDATE_BUSINESS_NOSHOW_GUARDS' then
      select block_reliability_threshold, auto_block_no_show_count
      into cur_block, cur_auto
      from public.businesses
      where id = s.business_id;
      if s.action_payload ? 'block_reliability_threshold' then
        v_block_thr := public.clamp_int((s.action_payload->>'block_reliability_threshold')::int, 0, 100);
      else
        v_block_thr := cur_block;
      end if;
      if s.action_payload ? 'auto_block_no_show_count' then
        v_auto_ns := greatest(2, (s.action_payload->>'auto_block_no_show_count')::int);
      else
        v_auto_ns := cur_auto;
      end if;
      update public.businesses
      set
        block_reliability_threshold = v_block_thr,
        auto_block_no_show_count = v_auto_ns,
        updated_at = now_ts
      where id = s.business_id;

    elsif s.action_type = 'ADD_CUSTOMER_TAG' then
      v_customer_id := nullif((s.action_payload->>'customer_user_id')::text, '')::uuid;
      v_tag := coalesce(nullif(s.action_payload->>'tag', ''), 'note');
      v_note := nullif(s.action_payload->>'note', '');
      insert into public.business_customer_tags (business_id, customer_user_id, tag, note)
      values (s.business_id, v_customer_id, v_tag, v_note)
      on conflict (business_id, customer_user_id, tag)
      do update set
        note = coalesce(excluded.note, public.business_customer_tags.note),
        updated_at = now_ts;

    elsif s.action_type = 'SCHEDULE_EXTRA_REMINDER' then
      v_booking_id := nullif((s.action_payload->>'booking_id')::text, '')::uuid;
      v_kind := coalesce(nullif(s.action_payload->>'kind', ''), 'reminder_extra');
      v_deliver_at := nullif(s.action_payload->>'deliver_at', '')::timestamptz;
      if v_deliver_at is null then
        raise exception 'deliver_at_required';
      end if;
      select id, business_id, customer_user_id, start_at, status
      into b
      from public.bookings
      where id = v_booking_id and business_id = s.business_id;
      if b is null then
        raise exception 'booking_not_found';
      end if;
      if b.status <> 'confirmed' then
        raise exception 'booking_not_confirmed';
      end if;
      if v_deliver_at <= now_ts + interval '30 seconds' then
        raise exception 'deliver_at_too_soon';
      end if;
      if v_deliver_at >= b.start_at - interval '10 minutes' then
        raise exception 'deliver_at_too_late';
      end if;
      epoch := extract(epoch from b.start_at)::bigint;
      perform public.notify_user_at(
        b.customer_user_id,
        b.business_id,
        b.id,
        v_kind,
        'Promemoria extra (affidabilità)',
        'Promemoria aggiuntivo per ridurre rischi di no-show: conferma la prenotazione o avvisa in anticipo in caso di imprevisti.',
        '/prenotazioni',
        (b.id::text || ':' || v_kind || ':' || epoch::text),
        v_deliver_at
      );

    else
      raise exception 'unknown_action_type';
    end if;

    update public.ai_suggestions
    set status = 'applied', applied_at = now_ts, applied_by_user_id = auth.uid()
    where id = p_suggestion_id;

    insert into public.ai_suggestion_audit (suggestion_id, business_id, user_id, action_type, action_payload, result)
    values (p_suggestion_id, s.business_id, auth.uid(), s.action_type, s.action_payload, 'success');

    if not p_skip_agent_execution_log then
      begin
        insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
        values (
          s.business_id,
          'trustbook_manual_apply',
          'apply_ai_suggestion',
          jsonb_build_object(
            'suggestion_id', p_suggestion_id,
            'action_type', s.action_type,
            'title', s.title,
            'source', 'manual'
          ),
          jsonb_build_object('status', 'applied'),
          auth.uid()
        );
      exception when others then
        null;
      end;
    end if;

  exception when others then
    insert into public.ai_suggestion_audit (suggestion_id, business_id, user_id, action_type, action_payload, result, error)
    values (p_suggestion_id, s.business_id, auth.uid(), s.action_type, s.action_payload, 'fail', sqlerrm);

    if not p_skip_agent_execution_log then
      begin
        insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, error, executed_by)
        values (
          s.business_id,
          'trustbook_manual_apply',
          'apply_ai_suggestion',
          jsonb_build_object(
            'suggestion_id', p_suggestion_id,
            'action_type', s.action_type,
            'title', s.title,
            'source', 'manual'
          ),
          jsonb_build_object('status', 'failed'),
          sqlerrm,
          auth.uid()
        );
      exception when others then
        null;
      end;
    end if;

    raise;
  end;
end
$$;

revoke all on function public.apply_ai_suggestion(uuid, boolean) from public;
grant execute on function public.apply_ai_suggestion(uuid, boolean) to authenticated;

-- Update batch: apply whitelisted only for new/read suggestions.
create or replace function public.auto_apply_whitelisted_ai_suggestions(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  eco record;
  applied int := 0;
  failure_count int := 0;
  errs jsonb := '[]'::jsonb;
  r record;
  err_text text;
  val text;
  allowed_actions text[] := array[
    'UPDATE_BUSINESS_DEPOSIT',
    'UPDATE_BUSINESS_APPROVAL_MODE',
    'UPDATE_SERVICE_PRICE',
    'UPDATE_BUSINESS_MIN_GAP',
    'UPDATE_BUSINESS_NOSHOW_GUARDS',
    'ADD_CUSTOMER_TAG'
  ];
  max_per_batch constant int := 40;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  select *
  into eco
  from public.business_booking_ecosystem
  where business_id = p_business_id;

  if eco is null then
    raise exception 'ecosystem_not_found';
  end if;

  if coalesce(eco.ai_strict_confirmation_required, true) then
    raise exception 'ai_auto_requires_strict_off';
  end if;

  if eco.ai_execution_mode is distinct from 'auto_whitelisted' then
    raise exception 'ai_auto_mode_disabled';
  end if;

  if eco.ai_auto_action_types is null or cardinality(eco.ai_auto_action_types) = 0 then
    raise exception 'ai_auto_whitelist_empty';
  end if;

  for val in select unnest(eco.ai_auto_action_types) loop
    if not (val = any(allowed_actions)) then
      raise exception 'ai_auto_action_type_not_allowed:%', val;
    end if;
  end loop;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      'trustbook_auto_apply',
      'auto_apply_whitelisted_ai_suggestions_started',
      jsonb_build_object('allowed_action_types', to_jsonb(eco.ai_auto_action_types)),
      null,
      auth.uid()
    );
  exception when others then
    null;
  end;

  for r in
    select id, action_type
    from public.ai_suggestions
    where business_id = p_business_id
      and status in ('new','read')
      and action_type = any (eco.ai_auto_action_types)
    order by priority desc, generated_at asc
    limit max_per_batch
  loop
    begin
      perform public.apply_ai_suggestion(r.id, true);
      applied := applied + 1;
    exception when others then
      failure_count := failure_count + 1;
      err_text := sqlerrm;
      errs := errs || jsonb_build_array(jsonb_build_object('suggestion_id', r.id, 'action_type', r.action_type, 'error', err_text));
    end;
  end loop;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, error, executed_by)
    values (
      p_business_id,
      'trustbook_auto_apply',
      'auto_apply_whitelisted_ai_suggestions_finished',
      jsonb_build_object('attempted', applied + failure_count),
      jsonb_build_object('applied_count', applied, 'failure_count', failure_count),
      case when failure_count > 0 then 'some_failed' else null end,
      auth.uid()
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'applied_count', applied,
    'failure_count', failure_count,
    'failures', errs,
    'business_id', p_business_id
  );
end
$$;

revoke all on function public.auto_apply_whitelisted_ai_suggestions(uuid) from public;
grant execute on function public.auto_apply_whitelisted_ai_suggestions(uuid) to authenticated;
