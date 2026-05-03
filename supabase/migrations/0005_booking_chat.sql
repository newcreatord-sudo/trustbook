create table if not exists booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists booking_messages_booking_created_idx on booking_messages (booking_id, created_at);

create table if not exists booking_chat_reads (
  booking_id uuid not null references bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (booking_id, user_id)
);

alter table booking_messages enable row level security;
alter table booking_chat_reads enable row level security;

drop policy if exists booking_messages_select_participant on booking_messages;
create policy booking_messages_select_participant on booking_messages
for select to authenticated
using (
  exists (
    select 1
    from bookings b
    where b.id = booking_id
      and (
        b.customer_user_id = auth.uid()
        or is_business_owner(b.business_id)
      )
  )
);

drop policy if exists booking_messages_insert_participant on booking_messages;
create policy booking_messages_insert_participant on booking_messages
for insert to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1
    from bookings b
    where b.id = booking_id
      and (
        b.customer_user_id = auth.uid()
        or is_business_owner(b.business_id)
      )
  )
);

drop policy if exists booking_chat_reads_select_own on booking_chat_reads;
create policy booking_chat_reads_select_own on booking_chat_reads
for select to authenticated
using (user_id = auth.uid());

drop policy if exists booking_chat_reads_upsert_own on booking_chat_reads;
create policy booking_chat_reads_upsert_own on booking_chat_reads
for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from bookings b
    where b.id = booking_id
      and (
        b.customer_user_id = auth.uid()
        or is_business_owner(b.business_id)
      )
  )
);

