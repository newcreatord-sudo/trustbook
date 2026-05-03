drop policy if exists booking_chat_reads_select_participant on public.booking_chat_reads;
drop policy if exists booking_chat_reads_select_own on public.booking_chat_reads;

drop policy if exists booking_chat_reads_upsert_own on public.booking_chat_reads;
create policy booking_chat_reads_upsert_own on public.booking_chat_reads
  for all
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
  )
  with check (
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

