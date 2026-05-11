# Migrations renumber log

## 2026-05-11 — Audit duplicate prefixes resolution

Audit board found 8 duplicate migration prefixes that broke ordering integrity.
Resolution: keep the **first** (alphabetically) at the original prefix, move the
**second** to the next free monotonic slot. SQL content is unchanged; only the
file prefix differs.

| Original duplicate path | New monotonic path |
|---|---|
| `supabase/migrations/0030_prevent_overlapping_bookings.sql` | `supabase/migrations/0132_prevent_overlapping_bookings.sql` |
| `supabase/migrations/0045_subscription_change_requests.sql` | `supabase/migrations/0133_subscription_change_requests.sql` |
| `supabase/migrations/0092_notification_engine_anti_no_show.sql` | `supabase/migrations/0134_notification_engine_anti_no_show.sql` |
| `supabase/migrations/0093_notification_reminder_backfill.sql` | `supabase/migrations/0135_notification_reminder_backfill.sql` |
| `supabase/migrations/0094_scheduled_in_app_notifications_no_cron.sql` | `supabase/migrations/0136_scheduled_in_app_notifications_no_cron.sql` |
| `supabase/migrations/0120_claim_external_business_listing_rpc.sql` | `supabase/migrations/0137_claim_external_business_listing_rpc.sql` |
| `supabase/migrations/0121_external_business_listings_public_view.sql` | `supabase/migrations/0138_external_business_listings_public_view.sql` |
| `supabase/migrations/0123_external_business_listings_slug_clamp.sql` | `supabase/migrations/0139_external_business_listings_slug_clamp.sql` |

## Why "kept original" wins

All renamed migrations use `create or replace function`, `create table if not
exists`, `create index if not exists` and `drop policy if exists ... ; create
policy ...` idioms. Re-running them against a database that already executed
the duplicate-prefix versions is a no-op: the system catalog is identical.

## Operational rollout

1. Staging: `npm run db:apply-all:staging` — should be idempotent, no schema
   drift.
2. Production: `npm run db:apply-all:production` after staging green.
3. CI: `npm run check:migrations:integrity` now fails on any duplicate prefix.

## Hard rules going forward

- Each new migration prefix MUST be `max(existing) + 1`.
- If two branches land at the same prefix, the merge conflict resolver MUST
  renumber the latecomer before merging. CI guards against this.
- This log MUST be appended for every renumber operation.
