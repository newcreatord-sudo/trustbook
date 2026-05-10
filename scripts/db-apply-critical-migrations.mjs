/**
 * Applies the critical migration bundle in order.
 * Recovery after a failed run (e.g. duplicate policy): partial re-apply from a version
 * `node ./scripts/db-apply-critical-migrations.mjs --from=0062`
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'
import { pgSslFromEnv } from './lib/pg-ssl.mjs'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
let envFile = null
if (envFileArg) {
  envFile = envFileArg.slice('--env-file='.length).trim() || null
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
  if (envFile) {
    const local = `${envFile}.local`
    if (existsSync(resolve(process.cwd(), local))) {
      dotenv.config({ path: resolve(process.cwd(), local), override: true })
    }
  }
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const connectionString =
  (typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() ? process.env.DATABASE_URL.trim() : null) ??
  (typeof process.env.SUPABASE_DB_URL === 'string' && process.env.SUPABASE_DB_URL.trim() ? process.env.SUPABASE_DB_URL.trim() : null)

if (!connectionString || connectionString.includes('[YOUR-PASSWORD]')) {
  const hint = envFile ? ` (set it in ${envFile} or ${envFile}.local)` : ''
  process.stderr.write(`[db-apply-critical] Missing DATABASE_URL/SUPABASE_DB_URL${hint}.\n`)
  process.exit(2)
}

const migrationPaths = [
  'supabase/migrations/0033_owner_strict_sensitive_non_financial.sql',
  'supabase/migrations/0034_ai_suggestions_owner_strict_rpc.sql',
  'supabase/migrations/0035_booking_flow_guardrails.sql',
  'supabase/migrations/0036_booking_timezone_and_opening_hours_guard.sql',
  'supabase/migrations/0037_reinstate_booking_overlap_guard.sql',
  'supabase/migrations/0038_anti_no_show_engine_hardening.sql',
  'supabase/migrations/0039_chat_notifications_hardening.sql',
  'supabase/migrations/0040_notifications_chat_integrity.sql',
  'supabase/migrations/0041_fix_notifications_function_ambiguity.sql',
  'supabase/migrations/0042_ensure_notifications_dedupe_unique.sql',
  'supabase/migrations/0043_stripe_webhook_and_payment_idempotency.sql',
  'supabase/migrations/0044_saas_platform_upgrades.sql',
  'supabase/migrations/0045_subscription_change_requests.sql',
  'supabase/migrations/0046_deposit_policy_engine.sql',
  'supabase/migrations/0047_deposit_engine_v2_rpc.sql',
  'supabase/migrations/0048_deposit_engine_v3_server_enforcement.sql',
  'supabase/migrations/0049_anti_no_show_engine_core.sql',
  'supabase/migrations/0050_reliability_guard_fix.sql',
  'supabase/migrations/0051_booking_state_transition_guard_v2.sql',
  'supabase/migrations/0052_profiles_role_switch_reliability.sql',
  'supabase/migrations/0054_smart_agenda_enterprise.sql',
  'supabase/migrations/0055_create_booking_v3.sql',
  'supabase/migrations/0056_list_bookable_staff_for_booking.sql',
  'supabase/migrations/0057_booking_slot_sources_rpc.sql',
  'supabase/migrations/0058_list_bookable_slots_for_booking.sql',
  'supabase/migrations/0059_business_dashboard_booking_kpis_rpc.sql',
  'supabase/migrations/0060_remove_auth_auto_confirm_trigger.sql',
  'supabase/migrations/0061_customer_vip_no_deposit_booking.sql',
  'supabase/migrations/0062_reviews_verified_visit_only.sql',
  'supabase/migrations/0063_booking_ecosystem_foundation.sql',
  'supabase/migrations/0064_ai_agent_execution_policy.sql',
  'supabase/migrations/0065_booking_reschedule_rpcs.sql',
  'supabase/migrations/0066_booking_overlap_guard_align.sql',
  'supabase/migrations/0067_ai_suggestions_vertical_noshow_guards.sql',
  'supabase/migrations/0068_floor_plan_core_rpcs.sql',
  'supabase/migrations/0069_floor_plan_availability_and_ai.sql',
  'supabase/migrations/0070_floor_plan_customer_access_fix.sql',
  'supabase/migrations/0071_ai_agent_batch_audit.sql',
  'supabase/migrations/0072_apply_ai_suggestion_manual_agent_log.sql',
  'supabase/migrations/0073_business_operational_notes.sql',
  'supabase/migrations/0074_business_operational_notes_list_rpc.sql',
  'supabase/migrations/0075_ai_director_tool_scopes.sql',
  'supabase/migrations/0076_booking_increment_total_search_path_fix.sql',
  'supabase/migrations/0077_reliability_events_unique_index_fix.sql',
  'supabase/migrations/0078_notifications_on_conflict_fix.sql',
  'supabase/migrations/0079_booking_overlap_guard_vertical_staff_fix.sql',
  'supabase/migrations/0080_create_booking_v3_vertical_overlap_fix.sql',
  'supabase/migrations/0081_list_bookable_slots_vertical_resource_mode.sql',
  'supabase/migrations/0082_create_business_with_defaults_rpc.sql',
  'supabase/migrations/0083_business_add_staff_by_email_rpc.sql',
  'supabase/migrations/0084_create_booking_v3_with_resource_assignment.sql',
  'supabase/migrations/0085_business_listing_visibility.sql',
  'supabase/migrations/0086_public_listing_visibility_policies.sql',
  'supabase/migrations/0087_public_visibility_enforcement_rpcs.sql',
  'supabase/migrations/0088_subscription_monetization_plans_and_fees.sql',
  'supabase/migrations/0089_subscription_plan_psp_columns.sql',
  'supabase/migrations/0090_floor_plan_media_occupancy_and_station.sql',
  'supabase/migrations/0091_multi_business_live_overview.sql',
  'supabase/migrations/0092_notification_engine_anti_no_show.sql',
  'supabase/migrations/0093_notification_reminder_backfill.sql',
  'supabase/migrations/0094_scheduled_in_app_notifications_no_cron.sql',
  'supabase/migrations/0095_notify_user_at_notifications_dedupe.sql',
  'supabase/migrations/0096_business_public_reputation_rpc.sql',
  'supabase/migrations/0097_customer_reliability_select_scoped.sql',
  'supabase/migrations/0098_get_business_public_reputation_review_window.sql',
  'supabase/migrations/0099_review_reports_and_comment_cap.sql',
  'supabase/migrations/0100_review_reports_admin_list_rpc.sql',
  'supabase/migrations/0101_practical_ai_assistant_business.sql',
  'supabase/migrations/0102_generate_ai_suggestions_practical_bundle.sql',
  'supabase/migrations/0103_generate_ai_suggestions_evidence_privacy.sql',
  'supabase/migrations/0104_supabase_security_rls_hardening.sql',
  'supabase/migrations/0105_smart_agenda_privileges_fix.sql',
  'supabase/migrations/0106_smart_agenda_anon_select_restore.sql',
  'supabase/migrations/0107_security_team_roster_revoke_agenda_anon.sql',
  'supabase/migrations/0108_cursor_security_audit_no_mercy.sql',
  'supabase/migrations/0109_cursor_security_membership_helpers.sql',
  'supabase/migrations/0110_cursor_security_booking_chat_reads.sql',
  'supabase/migrations/0111_cursor_fix_agenda_privileges.sql',
  'supabase/migrations/0120_ai_booking_operator_tools.sql',
  'supabase/migrations/0121_ai_booking_operator_team_and_shared_approve.sql',
].map((p) => resolve(process.cwd(), p))

const fromArg = process.argv.find((x) => x.startsWith('--from=')) ?? null
const fromMigrationId = fromArg ? fromArg.slice('--from='.length).trim() : null

function migrationNumericPrefix(filePath) {
  const m = /^(\d+)_/.exec(basename(filePath))
  return m ? Number.parseInt(m[1], 10) : null
}

let migrationPathsToRun = migrationPaths
if (fromMigrationId) {
  const fromNum = Number.parseInt(fromMigrationId, 10)
  if (Number.isNaN(fromNum)) {
    process.stderr.write('[db-apply-critical] Invalid --from= value (expect e.g. --from=0062).\n')
    process.exit(2)
  }
  migrationPathsToRun = migrationPaths.filter((p) => {
    const n = migrationNumericPrefix(p)
    return n !== null && n >= fromNum
  })
  if (migrationPathsToRun.length === 0) {
    process.stderr.write(`[db-apply-critical] No migrations >= ${fromMigrationId} in bundle.\n`)
    process.exit(2)
  }
  process.stdout.write(
    `[db-apply-critical] --from=${fromMigrationId}: applying ${migrationPathsToRun.length} file(s).\n`,
  )
}

const useSsl = pgSslFromEnv('db-apply-critical')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

try {
  await client.connect()
  for (const filePath of migrationPathsToRun) {
    const sql = readFileSync(filePath, 'utf8')
    process.stdout.write(`[db-apply-critical] Applying ${filePath}\n`)
    await client.query(sql)
  }
  process.stdout.write('[db-apply-critical] Done.\n')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[db-apply-critical] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
