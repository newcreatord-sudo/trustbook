-- Platform settings for fees
CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_fee_percent decimal(5,2) NOT NULL DEFAULT 0.00,
  platform_fee_fixed_cents integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now()
);

-- Ensure only one row
CREATE UNIQUE INDEX IF NOT EXISTS platform_settings_single_row ON platform_settings((1));

-- Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id text PRIMARY KEY, -- e.g., 'business_free', 'business_pro', 'customer_vip'
  target_audience text NOT NULL CHECK (target_audience IN ('business', 'customer')),
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly', 'yearly', 'lifetime')),
  features jsonb NOT NULL DEFAULT '{}'::jsonb, -- e.g., {"max_staff": 3, "has_anti_noshow": true}
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Business Subscriptions
CREATE TABLE IF NOT EXISTS business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(business_id)
);

-- Customer Subscriptions
CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(customer_id)
);

-- RLS Policies
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform settings are viewable by everyone" ON platform_settings;
CREATE POLICY "Platform settings are viewable by everyone" ON platform_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Subscription plans are viewable by everyone" ON subscription_plans;
CREATE POLICY "Subscription plans are viewable by everyone" ON subscription_plans FOR SELECT USING (true);

DROP POLICY IF EXISTS "Business subscriptions are viewable by owner/staff" ON business_subscriptions;
CREATE POLICY "Business subscriptions are viewable by owner/staff" ON business_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_members.business_id = business_subscriptions.business_id 
      AND team_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Customer subscriptions are viewable by the customer" ON customer_subscriptions;
CREATE POLICY "Customer subscriptions are viewable by the customer" ON customer_subscriptions FOR SELECT
  USING (customer_id = auth.uid());

-- Insert default platform settings
INSERT INTO platform_settings (platform_fee_percent, platform_fee_fixed_cents)
VALUES (2.5, 30)
ON CONFLICT DO NOTHING;

-- Insert default plans
INSERT INTO subscription_plans (id, target_audience, name, price_cents, billing_interval, features)
VALUES 
  ('business_free', 'business', 'Starter', 0, 'monthly', '{"max_staff": 1, "max_services": 5, "anti_noshow": false, "custom_deposits": false}'),
  ('business_pro', 'business', 'Professional', 2900, 'monthly', '{"max_staff": 5, "max_services": 20, "anti_noshow": true, "custom_deposits": true}'),
  ('business_elite', 'business', 'Elite', 7900, 'monthly', '{"max_staff": 999, "max_services": 999, "anti_noshow": true, "custom_deposits": true, "priority_support": true}'),
  ('customer_vip', 'customer', 'TrustBook VIP', 490, 'monthly', '{"no_deposit_required": true, "priority_booking": true}')
ON CONFLICT DO NOTHING;

-- Trigger to assign free plan to new businesses
CREATE OR REPLACE FUNCTION public.assign_default_business_plan()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.business_subscriptions (business_id, plan_id, status)
  VALUES (NEW.id, 'business_free', 'active')
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_business_created_assign_plan ON public.businesses;
CREATE TRIGGER on_business_created_assign_plan
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_business_plan();

-- Backfill existing businesses with free plan
INSERT INTO public.business_subscriptions (business_id, plan_id, status)
SELECT id, 'business_free', 'active' FROM public.businesses
ON CONFLICT (business_id) DO NOTHING;
