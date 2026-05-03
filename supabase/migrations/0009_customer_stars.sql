alter table public.customer_reliability
add column if not exists stars int not null default 0;

alter table public.customer_reliability
add column if not exists last_star_awarded_at timestamptz;

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
  prev_score int;
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

  select score into prev_score from public.customer_reliability where user_id = target_user_id;

  update public.customer_reliability
  set
    score = public.clamp_int(score + delta, 0, 100),
    completed_count = completed_count + case when kind = 'completed' then 1 else 0 end,
    late_cancel_count = late_cancel_count + case when kind = 'late_cancel' then 1 else 0 end,
    no_show_count = no_show_count + case when kind = 'no_show' then 1 else 0 end,
    updated_at = now()
  where user_id = target_user_id
  returning score into next_score;

  if next_score = 100 and (prev_score is null or prev_score < 100) then
    update public.customer_reliability
    set stars = stars + 1, last_star_awarded_at = now()
    where user_id = target_user_id;
  end if;

  insert into public.reliability_events (user_id, booking_id, kind, delta)
  values (target_user_id, booking_id, kind, delta);

  score := next_score;
  return next;
end;
$$;

