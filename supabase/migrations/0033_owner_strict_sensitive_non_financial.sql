-- 0033_owner_strict_sensitive_non_financial.sql
-- Owner-only access for sensitive non-financial entities.

-- booking_internal_notes: owner-only read/write
drop policy if exists booking_internal_notes_select_member on public.booking_internal_notes;
drop policy if exists booking_internal_notes_write_member on public.booking_internal_notes;
drop policy if exists booking_internal_notes_select_owner on public.booking_internal_notes;
drop policy if exists booking_internal_notes_write_owner on public.booking_internal_notes;

create policy booking_internal_notes_select_owner on public.booking_internal_notes
for select to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and public.is_business_owner(b.business_id)
  )
);

create policy booking_internal_notes_write_owner on public.booking_internal_notes
for all to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and public.is_business_owner(b.business_id)
  )
)
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and public.is_business_owner(b.business_id)
  )
);

-- business_customer_tags: owner-only read/write
drop policy if exists business_customer_tags_select_member on public.business_customer_tags;
drop policy if exists business_customer_tags_write_member on public.business_customer_tags;
drop policy if exists business_customer_tags_select_owner on public.business_customer_tags;
drop policy if exists business_customer_tags_write_owner on public.business_customer_tags;

create policy business_customer_tags_select_owner on public.business_customer_tags
for select to authenticated
using (public.is_business_owner(business_id));

create policy business_customer_tags_write_owner on public.business_customer_tags
for all to authenticated
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));

-- ai_suggestions + ai_suggestion_audit: owner-only read
drop policy if exists ai_suggestions_select_member on public.ai_suggestions;
drop policy if exists ai_suggestions_select_owner on public.ai_suggestions;
create policy ai_suggestions_select_owner on public.ai_suggestions
for select to authenticated
using (public.is_business_owner(business_id));

drop policy if exists ai_suggestion_audit_select_member on public.ai_suggestion_audit;
drop policy if exists ai_suggestion_audit_select_owner on public.ai_suggestion_audit;
create policy ai_suggestion_audit_select_owner on public.ai_suggestion_audit
for select to authenticated
using (public.is_business_owner(business_id));
