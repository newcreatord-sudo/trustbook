-- owner_strict_assertions.sql
-- Fail-fast checks for owner-strict RLS/RPC hardening.
-- Run in Supabase SQL editor after migrations 0033 + 0034.

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'booking_internal_notes',
      'business_customer_tags',
      'ai_suggestions',
      'ai_suggestion_audit'
    )
    and policyname like '%_member%';

  if v_count > 0 then
    raise exception 'owner_strict_assertion_failed: member policies still present (%).', v_count;
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'booking_internal_notes',
      'business_customer_tags',
      'ai_suggestions',
      'ai_suggestion_audit'
    )
    and policyname not like '%write_none%'
    and coalesce(qual, '') not like '%is_business_owner%';

  if v_count > 0 then
    raise exception 'owner_strict_assertion_failed: found non-owner policy quals (%).', v_count;
  end if;
end
$$;

do $$
declare
  v_count int;
begin
  select count(*)
  into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('generate_ai_suggestions', 'apply_ai_suggestion')
    and pg_get_functiondef(p.oid) not like '%owner_only%';

  if v_count > 0 then
    raise exception 'owner_strict_assertion_failed: RPC owner guard missing (%).', v_count;
  end if;
end
$$;

select 'owner_strict_assertions_passed' as result;
