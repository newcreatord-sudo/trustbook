create or replace function public.notify_user_at(
  recipient uuid,
  business uuid,
  booking uuid,
  kind text,
  title text,
  body text,
  link text,
  dedupe_key text,
  deliver_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_user_id, business_id, booking_id, kind, title, body, link, dedupe_key, deliver_at)
  values (recipient, business, booking, kind, title, body, link, dedupe_key, deliver_at)
  on conflict on constraint notifications_dedupe do nothing;
end;
$$;

revoke all on function public.notify_user_at(uuid, uuid, uuid, text, text, text, text, text, timestamptz) from public;

drop trigger if exists trg_bookings_in_app_reminders_on_change on public.bookings;
drop function if exists public.bookings_in_app_reminders_on_change();
drop function if exists public.upsert_booking_in_app_reminders(uuid);

delete from public.notifications
where kind in ('reminder_24h', 'reminder_2h')
  and deliver_at is not null
  and deliver_at > now()
  and email_sent_at is null;
