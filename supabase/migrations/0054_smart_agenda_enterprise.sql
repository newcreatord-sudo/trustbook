-- Migration 0054_smart_agenda_enterprise.sql
-- Enterprise features for Smart Agenda

-- Staff settings
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS max_simultaneous_bookings int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_bookable boolean DEFAULT true;

-- Business overbooking and advanced settings
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS allow_overbooking boolean DEFAULT false;

-- Services advanced times
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS buffer_before_min int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_min int DEFAULT 0;

-- Booking additions
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS overbooked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_group_id uuid,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Recurring rules table
CREATE TABLE IF NOT EXISTS public.recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  staff_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval int NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date,
  count int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Staff availability overrides (Ferie, permessi, chiusure specifiche per staff)
CREATE TABLE IF NOT EXISTS public.staff_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at < end_at)
);

-- Blocked slots (manual blocks for the whole business or specific staff)
CREATE TABLE IF NOT EXISTS public.blocked_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at < end_at)
);

-- RLS Policies (idempotent re-apply)
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read recurring_rules" ON public.recurring_rules;
DROP POLICY IF EXISTS "Public read staff_closures" ON public.staff_closures;
DROP POLICY IF EXISTS "Public read blocked_slots" ON public.blocked_slots;
DROP POLICY IF EXISTS "Owner manage recurring_rules" ON public.recurring_rules;
DROP POLICY IF EXISTS "Owner manage staff_closures" ON public.staff_closures;
DROP POLICY IF EXISTS "Owner manage blocked_slots" ON public.blocked_slots;

CREATE POLICY "Public read recurring_rules" ON public.recurring_rules FOR SELECT USING (true);
CREATE POLICY "Public read staff_closures" ON public.staff_closures FOR SELECT USING (true);
CREATE POLICY "Public read blocked_slots" ON public.blocked_slots FOR SELECT USING (true);

CREATE POLICY "Owner manage recurring_rules" ON public.recurring_rules
  FOR ALL USING (public.is_business_owner(business_id));
CREATE POLICY "Owner manage staff_closures" ON public.staff_closures
  FOR ALL USING (public.is_business_owner(business_id));
CREATE POLICY "Owner manage blocked_slots" ON public.blocked_slots
  FOR ALL USING (public.is_business_owner(business_id));
