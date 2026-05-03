-- Cap comment length (anti-abuse / storage). Truncate legacy rows before adding CHECK.
update public.reviews
set comment = left(comment, 1500)
where comment is not null
  and char_length(comment) > 1500;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conname = 'reviews_comment_max_length'
      and c.conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_comment_max_length
      check (comment is null or char_length(comment) <= 1500);
  end if;
end
$$;

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_user_id)
);

create index if not exists review_reports_review_id_idx on public.review_reports (review_id);
create index if not exists review_reports_created_at_idx on public.review_reports (created_at desc);

alter table public.review_reports enable row level security;

drop policy if exists review_reports_select_own on public.review_reports;
create policy review_reports_select_own on public.review_reports
for select to authenticated
using (reporter_user_id = auth.uid());

revoke all on public.review_reports from public;
grant select on public.review_reports to authenticated;

create or replace function public.submit_review_report(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rev public.reviews;
  caller uuid := auth.uid();
  rlen int;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if p_review_id is null then
    raise exception 'invalid_review';
  end if;

  rlen := char_length(trim(coalesce(p_reason, '')));
  if rlen < 12 then
    raise exception 'reason_too_short';
  end if;
  if rlen > 2000 then
    raise exception 'reason_too_long';
  end if;

  select * into rev from public.reviews where id = p_review_id;
  if rev is null then
    raise exception 'review_not_found';
  end if;

  if rev.direction = 'customer_to_business' then
    if not public.is_business_member(rev.business_id) then
      raise exception 'not_authorized';
    end if;
  elsif rev.direction = 'business_to_customer' then
    if not exists (
      select 1 from public.bookings bk
      where bk.id = rev.booking_id
        and bk.customer_user_id = caller
    ) then
      raise exception 'not_authorized';
    end if;
  else
    raise exception 'invalid_review_direction';
  end if;

  insert into public.review_reports (review_id, reporter_user_id, reason)
  values (p_review_id, caller, trim(p_reason))
  on conflict (review_id, reporter_user_id) do update
    set reason = excluded.reason,
        created_at = now();
end;
$$;

revoke all on function public.submit_review_report(uuid, text) from public;
grant execute on function public.submit_review_report(uuid, text) to authenticated;
