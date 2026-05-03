-- AI agent batch: audit trail + whitelist validation + hard cap — riduce errori operativi e rende tracciabile ogni esecuzione autorizzata.

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

  foreach val in array eco.ai_auto_action_types
  loop
    if val is null or trim(val) = '' then
      raise exception 'ai_whitelist_invalid_entry';
    end if;
    if not (trim(val) = any(allowed_actions)) then
      raise exception 'ai_whitelist_unknown_action_type: %', trim(val);
    end if;
  end loop;

  insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
  values (
    p_business_id,
    'trustbook_whitelist_agent',
    'auto_apply_whitelisted_ai_suggestions_started',
    jsonb_build_object(
      'whitelist', to_jsonb(eco.ai_auto_action_types),
      'max_per_batch', max_per_batch
    ),
    jsonb_build_object(
      'mode', eco.ai_execution_mode,
      'strict_confirmation_required', coalesce(eco.ai_strict_confirmation_required, true)
    ),
    auth.uid()
  );

  for r in
    select id, action_type, title
    from (
      select s.id, s.action_type, s.title
      from public.ai_suggestions s
      where s.business_id = p_business_id
        and s.status = 'active'
        and s.action_type = any (eco.ai_auto_action_types)
      order by s.priority desc, s.generated_at asc
      limit max_per_batch
    ) q
  loop
    begin
      perform public.apply_ai_suggestion(r.id);
      applied := applied + 1;

      begin
        insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
        values (
          p_business_id,
          'trustbook_whitelist_agent',
          'apply_ai_suggestion',
          jsonb_build_object(
            'suggestion_id', r.id,
            'action_type', r.action_type,
            'title', r.title
          ),
          jsonb_build_object('status', 'applied'),
          auth.uid()
        );
      exception when others then
        null;
      end;
    exception when others then
      err_text := sqlerrm;
      failure_count := failure_count + 1;
      errs := errs || jsonb_build_array(jsonb_build_object('suggestion_id', r.id, 'error', err_text));

      begin
        insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, error, executed_by)
        values (
          p_business_id,
          'trustbook_whitelist_agent',
          'apply_ai_suggestion',
          jsonb_build_object(
            'suggestion_id', r.id,
            'action_type', r.action_type,
            'title', r.title
          ),
          jsonb_build_object('status', 'failed'),
          err_text,
          auth.uid()
        );
      exception when others then
        null;
      end;
    end;
  end loop;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      'trustbook_whitelist_agent',
      'auto_apply_whitelisted_ai_suggestions_finished',
      jsonb_build_object(
        'applied_count', applied,
        'failure_count', failure_count
      ),
      jsonb_build_object(
        'failures', errs
      ),
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
end;
$$;

revoke all on function public.auto_apply_whitelisted_ai_suggestions(uuid) from public;
grant execute on function public.auto_apply_whitelisted_ai_suggestions(uuid) to authenticated;
