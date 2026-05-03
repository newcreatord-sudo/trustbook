-- External billing identifiers for SaaS plans (Stripe Checkout subscriptions, future Mollie).
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_product_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS mollie_sku text;

COMMENT ON COLUMN public.subscription_plans.stripe_product_id IS 'Stripe Product id (prod_...) — optional metadata for dashboards.';
COMMENT ON COLUMN public.subscription_plans.stripe_price_id IS 'Stripe Price id (price_...) for Checkout mode=subscription.';
COMMENT ON COLUMN public.subscription_plans.mollie_sku IS 'Opaque SKU / offer reference when Mollie Subscriptions is wired.';
