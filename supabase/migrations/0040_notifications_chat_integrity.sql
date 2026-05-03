-- 0040_notifications_chat_integrity.sql
-- Final hardening for notifications/chat:
-- - unread/query performance indexes
-- - prevent user-side mutation of notification payload fields

create index if not exists notifications_recipient_unread_created_idx
on public.notifications (recipient_user_id, read_at, created_at desc);

create index if not exists booking_chat_reads_user_booking_idx
on public.booking_chat_reads (user_id, booking_id, last_read_at desc);

create or replace function public.trg_notifications_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_service boolean;
begin
  is_service := auth.role() = 'service_role';
  if is_service then
    return new;
  end if;

  if new.recipient_user_id is distinct from old.recipient_user_id
    or new.business_id is distinct from old.business_id
    or new.booking_id is distinct from old.booking_id
    or new.kind is distinct from old.kind
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.link is distinct from old.link
    or new.dedupe_key is distinct from old.dedupe_key
    or new.created_at is distinct from old.created_at
  then
    raise exception 'unauthorized_notification_mutation';
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update
before update on public.notifications
for each row execute function public.trg_notifications_guard_update();
