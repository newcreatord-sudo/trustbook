create or replace function public.ai_list_business_booking_payments(
  p_business_id uuid,
  p_limit int default 100,
  p_agent_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int;
  j jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_member(p_business_id) then
    raise exception 'member_only';
  end if;

  if not exists (
    select 1 from public.business_booking_ecosystem e
    where e.business_id = p_business_id and e.ai_booking_operator_enabled = true
  ) then
    raise exception 'ai_booking_operator_disabled';
  end if;

  v_lim := greatest(1, least(coalesce(p_limit, 100), 200));

  select coalesce(
    jsonb_agg(row_obj order by sort_ts desc),
    '[]'::jsonb
  )
  into j
  from (
    select
      jsonb_build_object(
        'id', bp.id,
        'booking_id', bp.booking_id,
        'provider', bp.provider,
        'kind', bp.kind,
        'amount_cents', bp.amount_cents,
        'currency', bp.currency,
        'stripe_session_id', bp.stripe_session_id,
        'stripe_payment_intent_id', bp.stripe_payment_intent_id,
        'status', bp.status,
        'created_at', bp.created_at,
        'updated_at', bp.updated_at,
        'booking', case
          when bk.id is not null then jsonb_build_object(
            'id', bk.id,
            'start_at', bk.start_at,
            'end_at', bk.end_at,
            'service_name', s.name,
            'customer', jsonb_build_object(
              'first_name', pr.first_name,
              'last_name', pr.last_name,
              'phone', pr.phone
            )
          )
          else null::jsonb
        end
      ) as row_obj,
      bp.created_at as sort_ts
    from public.booking_payments bp
    inner join public.bookings bk
      on bk.id = bp.booking_id
      and bk.business_id = p_business_id
    inner join (
      select b.id
      from public.bookings b
      where b.business_id = p_business_id
      order by b.created_at desc
      limit 200
    ) recent on recent.id = bk.id
    left join public.services s
      on s.id = bk.service_id
      and s.business_id = p_business_id
    left join public.profiles pr
      on pr.id = bk.customer_user_id
    order by bp.created_at desc
    limit v_lim
  ) sub;

  return coalesce(j, '[]'::jsonb);
end;
$$;

revoke all on function public.ai_list_business_booking_payments(uuid, int, text) from public;
grant execute on function public.ai_list_business_booking_payments(uuid, int, text) to authenticated;
