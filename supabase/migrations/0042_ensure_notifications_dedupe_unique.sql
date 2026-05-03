-- 0042_ensure_notifications_dedupe_unique.sql
-- Guarantee dedupe conflict target for notifications helper functions.

with ranked as (
  select
    ctid,
    row_number() over (
      partition by recipient_user_id, dedupe_key
      order by created_at desc, id desc
    ) as rn
  from public.notifications
  where dedupe_key is not null
)
delete from public.notifications n
using ranked r
where n.ctid = r.ctid
  and r.rn > 1;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'notifications'
      and c.conname = 'notifications_dedupe'
  ) then
    execute 'alter table public.notifications drop constraint if exists notifications_dedupe';
  end if;
end;
$$;

drop index if exists public.notifications_dedupe;

create unique index if not exists notifications_dedupe
on public.notifications (recipient_user_id, dedupe_key);
