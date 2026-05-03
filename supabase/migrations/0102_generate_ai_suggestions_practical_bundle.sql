-- Practical AI Assistant: richer deterministic suggestions (no LLM required).
-- Extends generate_ai_suggestions with schedule insights, text autofill, anomaly warnings, and extra reminder suggestions.

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
  b_block_thr int;
  b_auto_ns int;

  b_city text;
  b_cat text;
  b_desc text;

  eco_vertical text;

  dep_thr int;
  appr_thr int;

  risky_customer_id uuid;
  risky_score int;
  risky_no_show int;

  ns_new_block int;
  ns_new_auto int;
  ns_guard boolean;
  action_guard jsonb;

  cancels_7 int;
  cancels_prev21 int;
  cancels_expected numeric;

  ev jsonb;
  row record;
  sdesc text;
  ss record;
  reminder_horizon timestamptz;
  deliver_at timestamptz;
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

  select coalesce(
    (select e.booking_vertical::text from public.business_booking_ecosystem e where e.business_id = p_business_id limit 1),
    'service'
  )
  into eco_vertical;

  dep_thr := case when eco_vertical in ('hospitality_table', 'seat_assignment') then 1 else 2 end;
  appr_thr := case
    when eco_vertical = 'professional_slot' then 2
    when eco_vertical in ('hospitality_table', 'seat_assignment') then 2
    else 3
  end;

  to_ts := now();
  from_ts := to_ts - make_interval(days => range_days);

  delete from public.ai_suggestions
  where business_id = p_business_id
    and status in ('new','read');

  select
    count(*)::int,
    count(*) filter (where status = 'completed')::int,
    count(*) filter (where status = 'no_show')::int,
    count(*) filter (where status = 'late_cancel')::int
  into cnt_total, cnt_completed, cnt_no_show, cnt_late_cancel
  from public.bookings
  where business_id = p_business_id
    and start_at >= from_ts
    and start_at <= to_ts
    and status in ('completed','no_show','late_cancel','confirmed','cancelled_by_customer','cancelled_by_business');

  select
    deposit_enabled,
    deposit_rule::text,
    deposit_fixed_cents,
    deposit_percent,
    deposit_min_cents,
    deposit_max_cents,
    approval_mode::text,
    min_gap_min,
    block_reliability_threshold,
    auto_block_no_show_count,
    city,
    category,
    description
  into
    b_deposit_enabled,
    b_deposit_rule,
    b_deposit_fixed,
    b_deposit_percent,
    b_deposit_min,
    b_deposit_max,
    b_approval_mode,
    b_min_gap,
    b_block_thr,
    b_auto_ns,
    b_city,
    b_cat,
    b_desc
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

  -- 3) Deposit suggestion (risk anchored).
  if cnt_no_show >= dep_thr and (b_deposit_enabled is distinct from true) then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'deposit_policy',
      90,
      'Suggerimento caparra per ridurre i no-show',
      case
        when eco_vertical in ('hospitality_table', 'seat_assignment') then
          'In sala/posti il costo opportunità del tavolo è alto: anche un solo no-show nel periodo giustifica una caparra leggera per ancorare la prenotazione.'
        when eco_vertical = 'professional_slot' then
          'Negli slot professionali il tempo è poco sostituibile: una caparra riduce assenze e last-minute.'
        else
          'Nel periodo analizzato hai avuto no-show. Una caparra riduce le assenze e ti fa perdere meno tempo.'
      end,
      jsonb_build_array(
        'Verticalità: ' || eco_vertical,
        'No-show nel periodo: ' || cnt_no_show,
        'Finestra: ' || range_days || ' giorni'
      ),
      'Meno no-show e calendario più stabile.',
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

  -- 4) Risk-based approval suggestion.
  if cnt_no_show >= appr_thr and b_approval_mode <> 'risk_based' then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'approval_policy',
      80,
      'Suggerimento: approvazione “risk-based”',
      'Con l’approvazione basata sul rischio gestisci meglio clienti meno affidabili e proteggi il calendario.',
      jsonb_build_array(
        'Verticalità: ' || eco_vertical,
        'No-show nel periodo: ' || cnt_no_show,
        'Late-cancel nel periodo: ' || cnt_late_cancel
      ),
      'Riduce richieste a rischio e protegge slot ad alta domanda.',
      'UPDATE_BUSINESS_APPROVAL_MODE',
      jsonb_build_object('approval_mode', 'risk_based')
    );
  end if;

  -- 7) Service description autofill (deterministic template) for empty/short descriptions.
  for ss in
    select id, name, duration_min, price_cents, coalesce(description, '') as description
    from public.services
    where business_id = p_business_id
      and is_active = true
      and length(coalesce(description, '')) < 30
    order by updated_at asc
    limit 3
  loop
    sdesc :=
      'Durata: ' || ss.duration_min || ' min.' ||
      case when ss.price_cents is not null and ss.price_cents > 0 then ' Prezzo: €' || round(ss.price_cents / 100.0, 2) || '.' else '' end ||
      ' Prenotazione su TrustBook con gestione anti no-show (cancella in anticipo se hai imprevisti).';

    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'service_description',
      55,
      'Completa la descrizione servizio: ' || ss.name,
      'Una descrizione chiara riduce domande ripetitive e aumenta la conversione.',
      jsonb_build_array('Servizio senza descrizione o troppo breve.', 'Suggerimento generato da regole (template).'),
      'Più conversione e meno attrito in prenotazione.',
      'UPDATE_SERVICE_DESCRIPTION',
      jsonb_build_object('service_id', ss.id, 'description', sdesc)
    );
  end loop;

  -- 6) Business description autofill (deterministic template) if missing/too short.
  if length(coalesce(b_desc, '')) < 60 then
    select string_agg(s.name, ', ' order by s.name)
    into sdesc
    from public.services s
    where s.business_id = p_business_id and s.is_active = true;

    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'business_description',
      58,
      'Completa la descrizione attività',
      'Una descrizione breve ma precisa aumenta fiducia e prenotazioni (senza promesse false).',
      jsonb_build_array('Descrizione assente o troppo breve.', 'Suggerimento generato da regole (template).'),
      'Maggiore credibilità e conversione.',
      'UPDATE_BUSINESS_DESCRIPTION',
      jsonb_build_object(
        'description',
        left(
          'Attività ' || coalesce(nullif(trim(b_cat), ''), 'su prenotazione') ||
          case when nullif(trim(b_city), '') is not null then ' a ' || trim(b_city) else '' end ||
          '. Prenota in pochi click e gestisci modifiche/cancellazioni in modo trasparente.' ||
          case when nullif(trim(coalesce(sdesc,'')), '') is not null then ' Servizi principali: ' || sdesc || '.' else '' end,
          1200
        )
      )
    );
  end if;

  -- 1) Best times: where completed ratio is high.
  ev := '[]'::jsonb;
  for row in
    with x as (
      select
        extract(isodow from b.start_at)::int as dow,
        extract(hour from b.start_at)::int as h,
        count(*)::int as total,
        count(*) filter (where b.status = 'completed')::int as completed,
        count(*) filter (where b.status in ('no_show','late_cancel'))::int as bad
      from public.bookings b
      where b.business_id = p_business_id
        and b.start_at >= now() - interval '60 days'
        and b.status in ('completed','no_show','late_cancel','confirmed')
      group by 1,2
    )
    select *
    from x
    where total >= 6
      and (completed::numeric / total::numeric) >= 0.75
      and (bad::numeric / total::numeric) <= 0.15
    order by (completed::numeric / total::numeric) desc, total desc
    limit 3
  loop
    ev := ev || jsonb_build_array(
      'DOW ' || row.dow || ' · ' || lpad(row.h::text, 2, '0') || ':00 — ' || row.completed || '/' || row.total || ' completate'
    );
  end loop;
  if jsonb_array_length(ev) > 0 then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'best_times',
      62,
      'Orari migliori (basati su storico)',
      'Queste fasce hanno buona stabilità (completate alte, no-show/cancel tardive basse).',
      ev,
      'Aiuta a pianificare staff/risorse e spingere slot con migliore resa.',
      'INFO_ONLY',
      jsonb_build_object('source', 'rules', 'window_days', 60)
    );
  end if;

  -- 2) Critical slots: high no-show/late-cancel ratio.
  ev := '[]'::jsonb;
  for row in
    with x as (
      select
        extract(isodow from b.start_at)::int as dow,
        extract(hour from b.start_at)::int as h,
        count(*)::int as total,
        count(*) filter (where b.status = 'no_show')::int as ns,
        count(*) filter (where b.status = 'late_cancel')::int as lc
      from public.bookings b
      where b.business_id = p_business_id
        and b.start_at >= now() - interval '90 days'
        and b.status in ('completed','no_show','late_cancel','confirmed')
      group by 1,2
    )
    select *, ((ns + lc)::numeric / total::numeric) as risk_ratio
    from x
    where total >= 6
      and (ns + lc) >= 2
    order by risk_ratio desc, total desc
    limit 3
  loop
    ev := ev || jsonb_build_array(
      'DOW ' || row.dow || ' · ' || lpad(row.h::text, 2, '0') || ':00 — rischio ' || round(row.risk_ratio * 100.0, 0) || '%'
    );
  end loop;
  if jsonb_array_length(ev) > 0 then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'critical_slots',
      68,
      'Slot critici (storico no-show/cancel tardive)',
      'In queste fasce conviene essere più rigorosi: caparra, approvazione risk-based o reminder aggiuntivi per clienti a rischio.',
      ev,
      'Riduce sorprese e tempo perso nelle fasce più delicate.',
      'INFO_ONLY',
      jsonb_build_object('source', 'rules', 'window_days', 90)
    );
  end if;

  -- 5) Fill gaps: low booking days upcoming.
  ev := '[]'::jsonb;
  for row in
    select
      (date_trunc('day', d))::date as day,
      (select count(*) from public.bookings b where b.business_id = p_business_id and b.status in ('confirmed','pending_deposit','pending_approval') and b.start_at >= d and b.start_at < d + interval '1 day')::int as upcoming
    from generate_series(date_trunc('day', now()), date_trunc('day', now()) + interval '6 day', interval '1 day') d
    order by upcoming asc, day asc
    limit 4
  loop
    if row.upcoming <= 2 then
      ev := ev || jsonb_build_array(row.day::text || ' — prenotazioni previste: ' || row.upcoming);
    end if;
  end loop;
  if jsonb_array_length(ev) > 0 then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'fill_gaps_next_week',
      57,
      'Riempire buchi agenda (prossimi 7 giorni)',
      'Giorni con bassa domanda: valuta azioni concrete (promozione, reminder, staff flessibile, servizi rapidi).',
      ev,
      'Aiuta a stabilizzare il carico settimanale.',
      'INFO_ONLY',
      jsonb_build_object('source', 'rules', 'horizon_days', 7)
    );
  end if;

  -- Existing heuristic: reduce min-gap to increase capacity.
  if eco_vertical not in ('hospitality_table', 'seat_assignment')
     and b_min_gap is not null
     and b_min_gap >= 30
     and cnt_total >= 20 then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'min_gap',
      60,
      'Riduci il tempo di buffer tra appuntamenti',
      'Il buffer minimo tra appuntamenti è alto. Ridurlo può aiutarti a riempire più slot e aumentare la capacità giornaliera.',
      jsonb_build_array(
        'Verticalità: ' || eco_vertical,
        'Min gap attuale: ' || b_min_gap || ' min',
        'Prenotazioni nel periodo: ' || cnt_total
      ),
      'Più disponibilità e più slot vendibili.',
      'UPDATE_BUSINESS_MIN_GAP',
      jsonb_build_object('min_gap_min', greatest(10, b_min_gap - 10))
    );
  end if;

  -- 8) Weekly anomaly: cancellations spike.
  select
    count(*) filter (where b.cancelled_at >= now() - interval '7 days' and b.status in ('cancelled_by_customer','cancelled_by_business'))::int,
    count(*) filter (where b.cancelled_at >= now() - interval '28 days' and b.cancelled_at < now() - interval '7 days' and b.status in ('cancelled_by_customer','cancelled_by_business'))::int
  into cancels_7, cancels_prev21
  from public.bookings b
  where b.business_id = p_business_id;

  cancels_expected := (cancels_prev21::numeric / 3.0);
  if cancels_7 >= 3 and (cancels_expected is null or cancels_expected = 0 or cancels_7::numeric >= cancels_expected * 1.5) then
    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'weekly_cancellations_spike',
      72,
      'Avviso: questa settimana più cancellazioni del solito',
      'È un segnale operativo: verifica motivo (orari, caparra, approvazione, comunicazione).',
      jsonb_build_array(
        'Cancellazioni ultimi 7g: ' || cancels_7,
        'Baseline (media settimanale su 21g precedenti): ' || round(cancels_expected, 1)
      ),
      'Riduce churn e stabilizza prenotazioni.',
      'INFO_ONLY',
      jsonb_build_object('source', 'rules')
    );
  end if;

  -- Risky customer tagging suggestion (kept).
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
      'risky_customer_tag',
      50,
      'Tagga un cliente a rischio (interno)',
      'Feedback operativo interno: utile per staff/owner, non pubblico.',
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

  -- 9) Extra reminders for risky upcoming bookings (actionable).
  reminder_horizon := now() + interval '7 days';
  for row in
    select
      b.id as booking_id,
      b.start_at,
      b.customer_user_id,
      cr.risk_level,
      cr.score
    from public.bookings b
    join public.customer_reliability cr on cr.user_id = b.customer_user_id
    where b.business_id = p_business_id
      and b.status = 'confirmed'
      and b.start_at > now() + interval '6 hours'
      and b.start_at < reminder_horizon
      and cr.risk_level in ('yellow','red')
    order by (case when cr.risk_level = 'red' then 0 else 1 end), b.start_at asc
    limit 5
  loop
    deliver_at := case when row.risk_level = 'red' then row.start_at - interval '12 hours' else row.start_at - interval '6 hours' end;
    if deliver_at > now() + interval '5 minutes' then
      insert into public.ai_suggestions (
        business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
      )
      values (
        p_business_id,
        'extra_reminder',
        case when row.risk_level = 'red' then 82 else 74 end,
        'Suggerimento: reminder extra per prenotazione a rischio',
        'Per clienti a rischio conviene aggiungere un promemoria extra in-app (senza email/SMS) per ridurre no-show.',
        jsonb_build_array(
          'Booking: ' || row.booking_id::text,
          'Rischio: ' || row.risk_level || ' (score ' || coalesce(row.score, 80) || ')',
          'Deliver at: ' || deliver_at::text
        ),
        'Riduce no-show e migliora puntualità/cancellazioni in anticipo.',
        'SCHEDULE_EXTRA_REMINDER',
        jsonb_build_object(
          'booking_id', row.booking_id,
          'kind', case when row.risk_level = 'red' then 'reminder_extra_12h' else 'reminder_extra_6h' end,
          'deliver_at', deliver_at
        )
      );
    end if;
  end loop;

  -- Tighten no-show guards (kept).
  ns_guard := false;
  ns_new_block := null;
  ns_new_auto := null;

  if cnt_no_show >= 2 and coalesce(b_block_thr, 0) < 85 then
    ns_new_block := least(95, coalesce(b_block_thr, 15) + 5);
    ns_guard := true;
  end if;

  if cnt_no_show >= 3 and coalesce(b_auto_ns, 3) > 2 then
    ns_new_auto := greatest(2, coalesce(b_auto_ns, 3) - 1);
    ns_guard := true;
  end if;

  if ns_guard then
    action_guard := '{}'::jsonb;
    if ns_new_block is not null then
      action_guard := action_guard || jsonb_build_object('block_reliability_threshold', ns_new_block);
    end if;
    if ns_new_auto is not null then
      action_guard := action_guard || jsonb_build_object('auto_block_no_show_count', ns_new_auto);
    end if;

    insert into public.ai_suggestions (
      business_id, kind, priority, title, explanation, evidence, expected_impact, action_type, action_payload
    )
    values (
      p_business_id,
      'tighten_noshow_guards',
      88,
      'Stringi le soglie operative anti no-show',
      'Modifica solo parametri già definiti in Impostazioni — conferma sempre il trade-off sul volume richieste.',
      jsonb_build_array(
        'Verticalità: ' || eco_vertical,
        'No-show nel periodo: ' || cnt_no_show,
        case when ns_new_block is not null then 'Nuova soglia affidabilità minima (blocco): ' || ns_new_block else 'Soglia affidabilità: invariata in questo suggerimento' end,
        case when ns_new_auto is not null then 'Nuovo limite storico no-show (blocco): ' || ns_new_auto else 'Limite storico no-show: invariato in questo suggerimento' end
      ),
      'Più controllo sul rischio cliente prima che occupi slot.',
      'UPDATE_BUSINESS_NOSHOW_GUARDS',
      action_guard
    );
  end if;

  return query
  select *
  from public.ai_suggestions
  where business_id = p_business_id
    and status in ('new','read')
  order by priority desc, generated_at desc;
end;
$$;

revoke all on function public.generate_ai_suggestions(uuid, int) from public;
grant execute on function public.generate_ai_suggestions(uuid, int) to authenticated;

