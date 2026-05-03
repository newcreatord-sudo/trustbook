-- Close privacy hole: reliability_select_authed previously allowed any authenticated user to read all rows.
-- Scope reads to: own profile, or customers who have at least one booking with a business where caller is a member.

drop policy if exists reliability_select_authed on public.customer_reliability;

create policy reliability_select_authed on public.customer_reliability
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.bookings bk
    where bk.customer_user_id = customer_reliability.user_id
      and public.is_business_member(bk.business_id)
  )
);
