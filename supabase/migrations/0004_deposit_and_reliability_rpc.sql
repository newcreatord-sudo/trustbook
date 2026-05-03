do $$
begin
  if not exists (select 1 from pg_type where typname = 'deposit_rule') then
    create type deposit_rule as enum ('off', 'all', 'risky_only');
  end if;
end
$$;

alter table businesses
  add column if not exists deposit_rule deposit_rule not null default 'all',
  add column if not exists deposit_risky_threshold int not null default 60;

create or replace function public.clamp_int(v int, min_v int, max_v int)
returns int
language sql
immutable
as $$
  select greatest(min_v, least(max_v, v));
$$;

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
  is_owner boolean;
  next_score int;
begin
  select business_id into b_id from public.bookings where id = booking_id;
  if b_id is null then
    raise exception 'booking_not_found';
  end if;

  select exists(
    select 1 from public.businesses b where b.id = b_id and b.owner_user_id = auth.uid()
  ) into is_owner;

  if (auth.uid() <> target_user_id) and (not is_owner) then
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

revoke all on function public.apply_reliability_delta(uuid, uuid, text, int) from public;
grant execute on function public.apply_reliability_delta(uuid, uuid, text, int) to authenticated;

