-- 0039_chat_notifications_hardening.sql
-- Chat/notification hardening:
-- - allow staff members (business_member) access to booking chat
-- - expose efficient unread chat counter RPC for current user

drop policy if exists booking_messages_select_participant on public.booking_messages;
create policy booking_messages_select_participant on public.booking_messages
for select to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (
        b.customer_user_id = auth.uid()
        or public.is_business_member(b.business_id)
      )
  )
);

drop policy if exists booking_messages_insert_participant on public.booking_messages;
create policy booking_messages_insert_participant on public.booking_messages
for insert to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (
        b.customer_user_id = auth.uid()
        or public.is_business_member(b.business_id)
      )
  )
);

drop policy if exists booking_chat_reads_upsert_own on public.booking_chat_reads;
create policy booking_chat_reads_upsert_own on public.booking_chat_reads
for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (
        b.customer_user_id = auth.uid()
        or public.is_business_member(b.business_id)
      )
  )
);

create or replace function public.unread_booking_messages_count_for_current_user(
  p_business_ids uuid[] default null,
  p_customer_only boolean default false
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  v_count int := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select count(*)::int
  into v_count
  from public.booking_messages m
  join public.bookings b on b.id = m.booking_id
  left join public.booking_chat_reads r
    on r.booking_id = b.id
   and r.user_id = uid
  where m.sender_user_id <> uid
    and m.created_at > coalesce(r.last_read_at, '1970-01-01T00:00:00Z'::timestamptz)
    and (
      case
        when p_customer_only then b.customer_user_id = uid
        else (b.customer_user_id = uid or public.is_business_member(b.business_id))
      end
    )
    and (
      p_business_ids is null
      or b.business_id = any(p_business_ids)
    );

  return greatest(0, v_count);
end;
$$;
