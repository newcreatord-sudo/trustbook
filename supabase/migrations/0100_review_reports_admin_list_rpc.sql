-- Ops listing for review_reports + joined review metadata (service_role / backend only).

create or replace function public.list_review_reports_admin(p_limit int default 100)
returns table (
  report_id uuid,
  reported_at timestamptz,
  reporter_user_id uuid,
  review_id uuid,
  review_direction review_direction,
  review_rating int,
  review_comment text,
  review_business_id uuid,
  review_booking_id uuid,
  review_created_at timestamptz,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  lim := greatest(1, least(coalesce(p_limit, 100), 500));

  return query
  select
    rr.id as report_id,
    rr.created_at as reported_at,
    rr.reporter_user_id,
    rr.review_id,
    rv.direction as review_direction,
    rv.rating as review_rating,
    rv.comment as review_comment,
    rv.business_id as review_business_id,
    rv.booking_id as review_booking_id,
    rv.created_at as review_created_at,
    rr.reason
  from public.review_reports rr
  join public.reviews rv on rv.id = rr.review_id
  order by rr.created_at desc
  limit lim;
end;
$$;

revoke all on function public.list_review_reports_admin(int) from public;
grant execute on function public.list_review_reports_admin(int) to service_role;
