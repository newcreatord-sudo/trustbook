-- Migration 0046: Deposit Policy Engine

-- Add new values to booking_status enum if they don't exist
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'requires_deposit';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_payment_setup';

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS deposit_mode text DEFAULT 'none' CHECK (deposit_mode IN ('none', 'everyone', 'risk_based', 'dynamic')),
  ADD COLUMN IF NOT EXISTS deposit_value_type text DEFAULT 'percentage' CHECK (deposit_value_type IN ('percentage', 'fixed_amount')),
  ADD COLUMN IF NOT EXISTS deposit_green_rule jsonb DEFAULT '{"type": "percentage", "value": 0}'::jsonb,
  ADD COLUMN IF NOT EXISTS deposit_yellow_rule jsonb DEFAULT '{"type": "percentage", "value": 20}'::jsonb,
  ADD COLUMN IF NOT EXISTS deposit_red_rule jsonb DEFAULT '{"type": "percentage", "value": 50}'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_approval_for_high_risk boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancellation_free_until_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS refund_policy text DEFAULT 'flexible' CHECK (refund_policy IN ('flexible', 'moderate', 'strict', 'non_refundable')),
  ADD COLUMN IF NOT EXISTS deposit_retained_on_no_show boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS deposit_retained_on_late_cancel boolean DEFAULT true;

-- The jsonb structure for deposit rules can be:
-- {
--   "type": "percentage" | "fixed_amount",
--   "value": number (percentage or cents)
-- }

-- Update booking status to handle new states if not already present
-- We already have a text constraint on status. Let's check what's there and maybe we need to drop/recreate the constraint if it exists.
-- But since status is text with check in supabase, we might need to recreate the check.

-- Let's check the existing booking constraints if possible, or just alter status check.
-- Actually, status in bookings is just text. Let's make sure it allows 'requires_deposit', 'pending_payment_setup', 'pending_approval'

-- Let's check bookings table first.
