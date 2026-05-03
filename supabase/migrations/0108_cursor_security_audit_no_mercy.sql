-- Cursor security audit: fix concrete bypasses found in RLS + SECURITY DEFINER RPCs.

create or replace function public.list_staff_closures_for_booking(p_business_id uuid)
returns table (
  staff_id uuid,
  start_at timestamptz,
  end_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select sc.staff_id, sc.start_at, sc.end_at
  from public.staff_closures sc
  inner join public.team_members tm on tm.id = sc.staff_id and tm.business_id = sc.business_id
  where sc.business_id = p_business_id
    and exists (
      select 1
      from public.businesses b
      where b.id = p_business_id
        and (coalesce(b.listing_visible, true) is true or public.is_business_member(p_business_id))
    )
    and coalesce(tm.is_bookable, true) is true;
$$;

create or replace function public.list_blocked_slots_for_booking(p_business_id uuid)
returns table (
  staff_id uuid,
  start_at timestamptz,
  end_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select bs.staff_id, bs.start_at, bs.end_at
  from public.blocked_slots bs
  where bs.business_id = p_business_id
    and exists (
      select 1
      from public.businesses b
      where b.id = p_business_id
        and (coalesce(b.listing_visible, true) is true or public.is_business_member(p_business_id))
    );
$$;

create or replace function public.list_bookable_staff_for_booking(p_business_id uuid)
returns table (
  id uuid,
  display_name text,
  color text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tm.id,
    coalesce(
      nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      case tm.role when 'owner' then 'Referente' else 'Professionista' end
    ) as display_name,
    coalesce(nullif(trim(tm.color), ''), '#3b82f6') as color
  from public.team_members tm
  left join public.profiles p on p.id = tm.user_id
  where tm.business_id = p_business_id
    and exists (
      select 1
      from public.businesses b
      where b.id = p_business_id
        and (coalesce(b.listing_visible, true) is true or public.is_business_member(p_business_id))
    )
    and coalesce(tm.is_bookable, true) is true
  order by display_name asc, tm.id asc;
$$;

revoke all on function public.notify_user(uuid, uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.notify_business_members(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.notify_user_at(uuid, uuid, uuid, text, text, text, text, text, timestamptz) from public;

grant execute on function public.notify_user(uuid, uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.notify_business_members(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.notify_user_at(uuid, uuid, uuid, text, text, text, text, text, timestamptz) to service_role;

revoke all on function public.insert_booking_event(uuid, text, text, uuid, jsonb) from public;

drop policy if exists booking_chat_reads_select_own on public.booking_chat_reads;
create policy booking_chat_reads_select_participant on public.booking_chat_reads
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_chat_reads.booking_id
        and (
          b.customer_user_id = auth.uid()
          or public.is_business_member(b.business_id)
        )
    )
  );

revoke insert, update, delete on public.customer_reliability from authenticated;
revoke insert, update, delete on public.reliability_events from authenticated;

