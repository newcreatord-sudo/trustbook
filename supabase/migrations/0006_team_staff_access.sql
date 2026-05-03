create or replace function public.is_business_member(bid uuid)
returns boolean
language sql
stable
as $$
  select
    exists(
      select 1
      from public.businesses b
      where b.id = bid and b.owner_user_id = auth.uid()
    )
    or exists(
      select 1
      from public.team_members tm
      where tm.business_id = bid and tm.user_id = auth.uid()
    );
$$;

drop policy if exists bookings_select_participant on public.bookings;
create policy bookings_select_participant on public.bookings
for select to authenticated
using (
  customer_user_id = auth.uid()
  or public.is_business_member(business_id)
);

drop policy if exists bookings_update_participant on public.bookings;
create policy bookings_update_participant on public.bookings
for update to authenticated
using (
  customer_user_id = auth.uid()
  or public.is_business_member(business_id)
)
with check (
  customer_user_id = auth.uid()
  or public.is_business_member(business_id)
);

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
using (
  user_id = auth.uid()
)
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

create or replace function public.apply_reliability_delta(
  target_user_id uuid,
  booking_id uuid,
  kind text,
  delta int
)
returns table (score int)
language plpgsql
security definer
set search_path = public
as $$
declare
  b_id uuid;
  is_member boolean;
  next_score int;
begin
  select business_id into b_id from public.bookings where id = booking_id;
  if b_id is null then
    raise exception 'booking_not_found';
  end if;

  select public.is_business_member(b_id) into is_member;

  if (auth.uid() <> target_user_id) and (not is_member) then
    raise exception 'not_allowed';
  end if;

  insert into public.customer_reliability (user_id, score)
  values (target_user_id, 80)
  on conflict (user_id) do nothing;

  update public.customer_reliability
  set
    score = public.clamp_int(score + delta, 0, 100),
    completed_count = completed_count + case when kind = 'completed' then 1 else 0 end,
    late_cancel_count = late_cancel_count + case when kind = 'late_cancel' then 1 else 0 end,
    no_show_count = no_show_count + case when kind = 'no_show' then 1 else 0 end,
    updated_at = now()
  where user_id = target_user_id
  returning score into next_score;

  insert into public.reliability_events (user_id, booking_id, kind, delta)
  values (target_user_id, booking_id, kind, delta);

  score := next_score;
  return next;
end;
$$;

grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert, update, delete on public.booking_messages to authenticated;
grant select, insert, update, delete on public.booking_chat_reads to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
grant select, insert, update, delete on public.customer_reliability to authenticated;
grant select, insert, update, delete on public.reliability_events to authenticated;

