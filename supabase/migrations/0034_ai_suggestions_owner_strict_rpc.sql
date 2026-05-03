-- 0034_ai_suggestions_owner_strict_rpc.sql
-- Harden AI RPCs to owner-only access at DB layer.

create or replace function public.generate_ai_suggestions(
  p_business_id uuid,
  p_range_days int default 30
)
returns setof public.ai_suggestions
language plpgsql
security definer
set search_path = public
as $$
declare
  range_days int;
  from_ts timestamptz;
  to_ts timestamptz;

  cnt_total int;
  cnt_completed int;
  cnt_no_show int;
  cnt_late_cancel int;
  avg_ticket_cents int;
  top_service_id uuid;
  top_service_name text;
  top_service_price int;
  top_service_bookings int;

  b_deposit_enabled boolean;
  b_deposit_rule text;
  b_deposit_fixed int;
  b_deposit_percent int;
  b_deposit_min int;
  b_deposit_max int;
  b_approval_mode text;
  b_min_gap int;

  risky_customer_id uuid;
  risky_score int;
  risky_no_show int;
begin
  if p_range_days is null or p_range_days < 7 then
    range_days := 7;
  elsif p_range_days > 180 then
    range_days := 180;
  else
    range_days := p_range_days;
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  to_ts := now();
  from_ts := to_ts - make_interval(days => range_days);

  delete from public.ai_suggestions
  where business_id = p_business_id
    and status = 'active';

  select
    count(*)::int,
    count(*) filter (where status = 'completed')::int,
    count(*) filter (where status = 'no_show')::int,
    count(*) filter (where status = 'late_cancel')::int,
    coalesce(round(avg(coalesce(deposit_amount_cents, 0)))::int, 0)
  into cnt_total, cnt_completed, cnt_no_show, cnt_late_cancel, avg_ticket_cents
  from public.bookings
  where business_id = p_business_id
    and start_at >= from_ts
    and start_at <= to_ts
    and status in ('completed','no_show','late_cancel','confirmed','cancelled_by_customer','cancelled_by_business');

  select deposit_enabled, deposit_rule::text, deposit_fixed_cents, deposit_percent, deposit_min_cents, deposit_max_cents, approval_mode::text, min_gap_min
  into b_deposit_enabled, b_deposit_rule, b_deposit_fixed, b_deposit_percent, b_deposit_min, b_deposit_max, b_approval_mode, b_min_gap
  from public.businesses
  where id = p_business_id;

  select s.id, s.name, s.price_cents, x.cnt
  into top_service_id, top_service_name, top_service_price, top_service_bookings
  from (
    select service_id, count(*)::int as cnt
    from public.bookings
    where business_id = p_business_id
      and start_at >= from_ts
      and start_at <= to_ts
      and status in ('confirmed','completed','pending_approval','requested','pending_deposit')
    group by service_id
    order by cnt desc
    limit 1
  ) x
  join public.services s on s.id = x.service_id
  where s.business_id = p_business_id;

  if cnt_no_show >= 2 and (b_deposit_enabled is distinct from true) then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'reduce_no_show',
      90,
      'Attiva una caparra per ridurre i no-show',
      'Negli ultimi giorni hai avuto diversi no-show. Una caparra riduce le assenze e ti fa perdere meno tempo.',
      jsonb_build_array(
        'No-show nel periodo: ' || cnt_no_show,
        'Finestra analizzata: ' || range_days || ' giorni'
      ),
      'Riduce i no-show e aumenta le conferme.',
      'UPDATE_BUSINESS_DEPOSIT',
      jsonb_build_object(
        'deposit_enabled', true,
        'deposit_rule', 'all',
        'deposit_amount_mode', 'percent',
        'deposit_percent', 10,
        'deposit_min_cents', 500,
        'deposit_max_cents', 3000
      )
    );
  end if;

  if cnt_no_show >= 3 and b_approval_mode <> 'risk_based' then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'risk_management',
      80,
      'Attiva approvazione “risk-based”',
      'Con l’approvazione basata sul rischio puoi gestire meglio i clienti meno affidabili e ridurre cancellazioni e no-show.',
      jsonb_build_array(
        'No-show nel periodo: ' || cnt_no_show,
        'Late-cancel nel periodo: ' || cnt_late_cancel
      ),
      'Riduce richieste a rischio e protegge il calendario.',
      'UPDATE_BUSINESS_APPROVAL_MODE',
      jsonb_build_object('approval_mode', 'risk_based')
    );
  end if;

  if top_service_id is not null and top_service_price is not null and top_service_price > 0 and top_service_bookings >= 8 then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'increase_revenue',
      70,
      'Valuta un aumento prezzo per il servizio più richiesto',
      'Il servizio più prenotato nel periodo è molto richiesto. Un piccolo aumento (es. 10%) può aumentare gli incassi senza impattare troppo la domanda.',
      jsonb_build_array(
        'Servizio: ' || top_service_name,
        'Prenotazioni (periodo): ' || top_service_bookings,
        'Prezzo attuale: ' || round(top_service_price / 100.0, 2)
      ),
      'Possibile aumento incassi su servizio ad alta domanda.',
      'UPDATE_SERVICE_PRICE',
      jsonb_build_object(
        'service_id', top_service_id,
        'new_price_cents', (top_service_price * 110 / 100)
      )
    );
  end if;

  if b_min_gap is not null and b_min_gap >= 30 and cnt_total >= 20 then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'fill_gaps',
      60,
      'Riduci il tempo di buffer tra appuntamenti',
      'Il buffer minimo tra appuntamenti è alto. Ridurlo può aiutarti a riempire più slot e aumentare la capacità giornaliera.',
      jsonb_build_array(
        'Min gap attuale: ' || b_min_gap || ' min',
        'Prenotazioni nel periodo: ' || cnt_total
      ),
      'Più disponibilità e più slot vendibili.',
      'UPDATE_BUSINESS_MIN_GAP',
      jsonb_build_object('min_gap_min', greatest(10, b_min_gap - 10))
    );
  end if;

  select cr.user_id, cr.score, cr.no_show_count
  into risky_customer_id, risky_score, risky_no_show
  from public.customer_reliability cr
  join public.bookings b on b.customer_user_id = cr.user_id
  where b.business_id = p_business_id
    and b.start_at >= from_ts
    and b.start_at <= to_ts
  order by cr.no_show_count desc, cr.score asc
  limit 1;

  if risky_customer_id is not null and (risky_no_show is not null and risky_no_show >= 1) then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'risky_customers',
      50,
      'Tagga un cliente a rischio per applicare regole più rigide',
      'Un cliente con segnali di rischio nel periodo può richiedere regole più rigide (es. caparra obbligatoria o approvazione manuale).',
      jsonb_build_array(
        'Cliente: ' || risky_customer_id::text,
        'No-show totali (storico): ' || risky_no_show,
        'Affidabilità (score): ' || coalesce(risky_score, 80)
      ),
      'Riduce rischio operativo su richieste future.',
      'ADD_CUSTOMER_TAG',
      jsonb_build_object(
        'customer_user_id', risky_customer_id,
        'tag', 'no-show',
        'note', 'Suggerimento automatico: cliente con no-show recenti.'
      )
    );
  end if;

  return query
  select *
  from public.ai_suggestions
  where business_id = p_business_id
    and status = 'active'
  order by priority desc, generated_at desc;
end;
$$;

revoke all on function public.generate_ai_suggestions(uuid, int) from public;
grant execute on function public.generate_ai_suggestions(uuid, int) to authenticated;

create or replace function public.apply_ai_suggestion(p_suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  now_ts timestamptz;
  ok boolean;
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
begin
  now_ts := now();

  select * into s
  from public.ai_suggestions
  where id = p_suggestion_id;

  if s is null then
    raise exception 'suggestion_not_found';
  end if;

  if s.status <> 'active' then
    raise exception 'suggestion_not_active';
  end if;

  if not public.is_business_owner(s.business_id) then
    raise exception 'owner_only';
  end if;

  begin
    if s.action_type = 'UPDATE_SERVICE_PRICE' then
      if not public.is_business_owner(s.business_id) then
        raise exception 'owner_only';
      end if;
      v_service_id := nullif((s.action_payload->>'service_id')::text, '')::uuid;
      v_new_price := greatest(0, (s.action_payload->>'new_price_cents')::int);
      update public.services
      set price_cents = v_new_price, updated_at = now_ts
      where id = v_service_id and business_id = s.business_id;

      if not found then
        raise exception 'service_not_found';
      end if;

    elsif s.action_type = 'UPDATE_BUSINESS_DEPOSIT' then
      if not public.is_business_owner(s.business_id) then
        raise exception 'owner_only';
      end if;
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
      if not public.is_business_owner(s.business_id) then
        raise exception 'owner_only';
      end if;
      v_approval_mode := coalesce(nullif(s.action_payload->>'approval_mode', ''), 'manual');
      update public.businesses
      set approval_mode = v_approval_mode::approval_mode, updated_at = now_ts
      where id = s.business_id;

    elsif s.action_type = 'UPDATE_BUSINESS_MIN_GAP' then
      if not public.is_business_owner(s.business_id) then
        raise exception 'owner_only';
      end if;
      v_min_gap := greatest(0, (s.action_payload->>'min_gap_min')::int);
      update public.businesses
      set min_gap_min = v_min_gap, updated_at = now_ts
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
    else
      raise exception 'unknown_action_type';
    end if;

    update public.ai_suggestions
    set status = 'applied', applied_at = now_ts, applied_by_user_id = auth.uid()
    where id = p_suggestion_id;

    insert into public.ai_suggestion_audit (suggestion_id, business_id, user_id, action_type, action_payload, result)
    values (p_suggestion_id, s.business_id, auth.uid(), s.action_type, s.action_payload, 'success');
  exception when others then
    insert into public.ai_suggestion_audit (suggestion_id, business_id, user_id, action_type, action_payload, result, error)
    values (p_suggestion_id, s.business_id, auth.uid(), s.action_type, s.action_payload, 'fail', sqlerrm);
    raise;
  end;
end;
$$;

revoke all on function public.apply_ai_suggestion(uuid) from public;
grant execute on function public.apply_ai_suggestion(uuid) to authenticated;
