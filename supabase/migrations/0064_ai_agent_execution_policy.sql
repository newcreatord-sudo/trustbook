-- TrustBook: policy esecuzione agente AI (server-side, owner-only).
-- Non sostuisce conferme legali: l'auto-applicazione è consentita solo se l'attività abilita esplicitamente
-- modalità + whitelist tipi azione e disattiva strict confirmation.
-- Planimetria: si usa solo public.business_floor_plans / business_booking_resources (JSON TrustBook).
-- Renova 3D (o altri prodotti) è esterno: nessuna integrazione qui.

alter table public.business_booking_ecosystem
  add column if not exists ai_execution_mode text not null default 'assist'
    check (ai_execution_mode in ('assist', 'auto_whitelisted'));

alter table public.business_booking_ecosystem
  add column if not exists ai_auto_action_types text[] not null default '{}';

comment on column public.business_booking_ecosystem.ai_execution_mode is
  'assist: solo suggerimenti + applicazione manuale; auto_whitelisted: consentito RPC batch solo per action_type in ai_auto_action_types';
comment on column public.business_booking_ecosystem.ai_auto_action_types is
  'Sottoinsiemi di ai_suggestions.action_type applicabili in automatico dal RPC auto_apply_whitelisted_ai_suggestions';

-- ---------------------------------------------------------------------------
-- Blocchi disponibilità (intera attività o staff) — stesso modello dell'app, bypass RLS via definer + check owner.
-- ---------------------------------------------------------------------------
create or replace function public.business_upsert_blocked_slot(
  p_business_id uuid,
  p_staff_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'invalid_slot_range';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  if p_staff_id is not null then
    if not exists (
      select 1 from public.team_members tm
      where tm.id = p_staff_id and tm.business_id = p_business_id
    ) then
      raise exception 'staff_not_in_business';
    end if;
  end if;

  insert into public.blocked_slots (business_id, staff_id, start_at, end_at, reason)
  values (p_business_id, p_staff_id, p_start_at, p_end_at, nullif(trim(coalesce(p_reason, '')), ''))
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.business_upsert_blocked_slot(uuid, uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.business_upsert_blocked_slot(uuid, uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.business_delete_blocked_slot(
  p_blocked_slot_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bid uuid;
begin
  select business_id into bid from public.blocked_slots where id = p_blocked_slot_id;
  if bid is null then
    raise exception 'blocked_slot_not_found';
  end if;
  if not public.is_business_owner(bid) then
    raise exception 'owner_only';
  end if;
  delete from public.blocked_slots where id = p_blocked_slot_id;
end;
$$;

revoke all on function public.business_delete_blocked_slot(uuid) from public;
grant execute on function public.business_delete_blocked_slot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Assegnazione risorsa principale (tavolo/postazione) da planimetria TrustBook — non è Renova 3D.
-- ---------------------------------------------------------------------------
create or replace function public.set_booking_primary_resource(
  p_booking_id uuid,
  p_resource_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b_business uuid;
  r_business uuid;
begin
  select business_id into b_business from public.bookings where id = p_booking_id;
  if b_business is null then
    raise exception 'booking_not_found';
  end if;

  if not public.is_business_member(b_business) then
    raise exception 'member_only';
  end if;

  select business_id into r_business from public.business_booking_resources where id = p_resource_id;
  if r_business is null then
    raise exception 'resource_not_found';
  end if;
  if r_business <> b_business then
    raise exception 'resource_business_mismatch';
  end if;

  insert into public.booking_resource_assignments (booking_id, primary_resource_id)
  values (p_booking_id, p_resource_id)
  on conflict (booking_id) do update set
    primary_resource_id = excluded.primary_resource_id;
end;
$$;

revoke all on function public.set_booking_primary_resource(uuid, uuid) from public;
grant execute on function public.set_booking_primary_resource(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Batch: applica in sequenza solo suggerimenti la cui action_type è whitelisted (idem ai_apply singoli).
-- ---------------------------------------------------------------------------
create or replace function public.auto_apply_whitelisted_ai_suggestions(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  eco record;
  applied int := 0;
  errs jsonb := '[]'::jsonb;
  r record;
  err_text text;
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

  for r in
    select id
    from public.ai_suggestions
    where business_id = p_business_id
      and status = 'active'
      and action_type = any (eco.ai_auto_action_types)
    order by priority desc, generated_at asc
  loop
    begin
      perform public.apply_ai_suggestion(r.id);
      applied := applied + 1;
    exception when others then
      err_text := sqlerrm;
      errs := errs || jsonb_build_array(jsonb_build_object('suggestion_id', r.id, 'error', err_text));
    end;
  end loop;

  return jsonb_build_object(
    'applied_count', applied,
    'failures', errs,
    'business_id', p_business_id
  );
end;
$$;

revoke all on function public.auto_apply_whitelisted_ai_suggestions(uuid) from public;
grant execute on function public.auto_apply_whitelisted_ai_suggestions(uuid) to authenticated;
