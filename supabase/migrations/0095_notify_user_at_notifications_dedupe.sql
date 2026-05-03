-- notify_user_at (0094) referenced notifications_recipient_dedupe_key_key, which does not exist.
-- Dedupe unique constraint from 0078 is notifications_dedupe (recipient_user_id, dedupe_key).

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
