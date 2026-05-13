create or replace function public.business_dashboard_bootstrap_v1(
  p_business_id uuid,
  p_timezone text default 'Europe/Rome',
  p_limit int default 250,
  p_cursor timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_bookings jsonb;
  v_booking_ids uuid[];
  v_customer_ids uuid[];
  v_has_more boolean;
  v_next_cursor timestamptz;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'member_only';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 250), 1000));

  with b as (
    select *
    from public.bookings
    where business_id = p_business_id
      and (p_cursor is null or start_at < p_cursor)
    order by start_at desc
    limit v_limit + 1
  ),
  b2 as (
    select *
    from b
    order by start_at desc
    limit v_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(b2) order by b2.start_at desc), '[]'::jsonb),
    array_agg(b2.id),
    array_agg(distinct b2.customer_user_id),
    (select count(*) from b) > v_limit,
    (select min(start_at) from b2)
  into v_bookings, v_booking_ids, v_customer_ids, v_has_more, v_next_cursor
  from b2;

  return jsonb_build_object(
    'bookings',
    v_bookings,
    'has_more',
    coalesce(v_has_more, false),
    'next_cursor',
    v_next_cursor,
    'services',
    (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
      from public.services s
      where s.business_id = p_business_id
    ),
    'opening_windows',
    (
      select coalesce(jsonb_agg(to_jsonb(w) order by w.weekday asc, w.start_time asc), '[]'::jsonb)
      from public.business_opening_windows w
      where w.business_id = p_business_id
    ),
    'closures',
    (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.start_at desc), '[]'::jsonb)
      from public.business_closures c
      where c.business_id = p_business_id
    ),
    'reviewed_booking_ids',
    (
      select coalesce(jsonb_agg(r.booking_id), '[]'::jsonb)
      from public.reviews r
      where r.business_id = p_business_id and r.direction = 'business_to_customer'
    ),
    'reliability_by_user_id',
    (
      select coalesce(
        jsonb_object_agg(
          cr.user_id::text,
          jsonb_build_object(
            'score', cr.score,
            'stars', cr.stars,
            'no_show_count', cr.no_show_count,
            'late_cancel_count', cr.late_cancel_count
          )
        ),
        '{}'::jsonb
      )
      from public.customer_reliability cr
      where cr.user_id = any(coalesce(v_customer_ids, '{}'::uuid[]))
    ),
    'profiles_by_id',
    (
      select coalesce(
        jsonb_object_agg(
          p.id::text,
          jsonb_build_object(
            'first_name', p.first_name,
            'last_name', p.last_name,
            'phone', p.phone
          )
        ),
        '{}'::jsonb
      )
      from public.profiles p
      where p.id = any(coalesce(v_customer_ids, '{}'::uuid[]))
    ),
    'tags_by_user_id',
    (
      select coalesce(jsonb_object_agg(t.customer_user_id::text, t.tags), '{}'::jsonb)
      from (
        select
          customer_user_id,
          jsonb_agg(distinct tag order by tag) as tags
        from public.business_customer_tags
        where business_id = p_business_id
          and customer_user_id = any(coalesce(v_customer_ids, '{}'::uuid[]))
        group by customer_user_id
      ) t
    ),
    'booking_has_note',
    (
      select coalesce(jsonb_object_agg(n.booking_id::text, n.has_note), '{}'::jsonb)
      from (
        select
          booking_id,
          bool_or(length(trim(coalesce(body, ''))) > 0) as has_note
        from public.booking_internal_notes
        where booking_id = any(coalesce(v_booking_ids, '{}'::uuid[]))
        group by booking_id
      ) n
    ),
    'kpis',
    to_jsonb(public.business_dashboard_booking_kpis(p_business_id, coalesce(nullif(trim(p_timezone), ''), 'Europe/Rome')))
  );
end;
$$;

revoke all on function public.business_dashboard_bootstrap_v1(uuid, text, int, timestamptz) from public;
grant execute on function public.business_dashboard_bootstrap_v1(uuid, text, int, timestamptz) to authenticated;

