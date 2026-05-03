create or replace function public.is_business_owner(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = bid and b.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_business_member(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = bid and b.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.team_members tm
    where tm.business_id = bid and tm.user_id = auth.uid()
  );
$$;

