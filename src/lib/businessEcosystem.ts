import { supabase } from '@/lib/supabase'

export type BookingVertical =
  | 'service'
  | 'hospitality_table'
  | 'seat_assignment'
  | 'professional_slot'

/** assist: solo applicazione manuale; auto_whitelisted: RPC batch su suggerimenti in whitelist. */
export type AiExecutionMode = 'assist' | 'auto_whitelisted'

export type CustomerTableChoice = 'off' | 'preferred' | 'required'

export type TableAssignmentMode = 'auto' | 'customer_choice'

export type BusinessBookingEcosystemRow = {
  business_id: string
  booking_vertical: BookingVertical
  resource_management_enabled: boolean
  no_show_suite_enabled: boolean
  baseline_no_show_rate_pct: number | null
  target_no_show_rate_pct: number
  ai_strict_confirmation_required: boolean
  ai_execution_mode: AiExecutionMode
  ai_auto_action_types: string[]
  ai_notes_enabled: boolean
  ai_floor_plan_read_enabled: boolean
  ai_table_assignment_enabled: boolean
  ai_blocked_slots_enabled: boolean
  customer_table_choice: CustomerTableChoice
  default_table_assignment_mode: TableAssignmentMode
  ecosystem_notes: string | null
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

function asBool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}

function asExecutionMode(v: unknown): AiExecutionMode {
  return v === 'auto_whitelisted' ? 'auto_whitelisted' : 'assist'
}

function asTextArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function asCustomerTableChoice(v: unknown): CustomerTableChoice {
  return v === 'preferred' || v === 'required' ? v : 'off'
}

function asTableAssignmentMode(v: unknown): TableAssignmentMode {
  return v === 'customer_choice' ? 'customer_choice' : 'auto'
}

export function parseEcosystemRow(v: unknown): BusinessBookingEcosystemRow | null {
  if (typeof v !== 'object' || v === null) return null
  const r = v as Record<string, unknown>
  const business_id = typeof r.business_id === 'string' ? r.business_id : null
  if (!business_id) return null
  const vertical = r.booking_vertical
  const booking_vertical: BookingVertical =
    vertical === 'hospitality_table' ||
    vertical === 'seat_assignment' ||
    vertical === 'professional_slot' ||
    vertical === 'service'
      ? vertical
      : 'service'
  const settingsRaw = r.settings
  const settings =
    typeof settingsRaw === 'object' && settingsRaw !== null && !Array.isArray(settingsRaw)
      ? (settingsRaw as Record<string, unknown>)
      : {}
  return {
    business_id,
    booking_vertical,
    resource_management_enabled: asBool(r.resource_management_enabled, false),
    no_show_suite_enabled: asBool(r.no_show_suite_enabled, false),
    baseline_no_show_rate_pct: asNum(r.baseline_no_show_rate_pct),
    target_no_show_rate_pct: asNum(r.target_no_show_rate_pct) ?? 1,
    ai_strict_confirmation_required: asBool(r.ai_strict_confirmation_required, true),
    ai_execution_mode: asExecutionMode(r.ai_execution_mode),
    ai_auto_action_types: asTextArray(r.ai_auto_action_types),
    ai_notes_enabled: asBool(r.ai_notes_enabled, false),
    ai_floor_plan_read_enabled: asBool(r.ai_floor_plan_read_enabled, false),
    ai_table_assignment_enabled: asBool(r.ai_table_assignment_enabled, false),
    ai_blocked_slots_enabled: asBool(r.ai_blocked_slots_enabled, false),
    customer_table_choice: asCustomerTableChoice(r.customer_table_choice),
    default_table_assignment_mode: asTableAssignmentMode(r.default_table_assignment_mode),
    ecosystem_notes: typeof r.ecosystem_notes === 'string' ? r.ecosystem_notes : null,
    settings,
    created_at: typeof r.created_at === 'string' ? r.created_at : new Date(0).toISOString(),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(0).toISOString(),
  }
}

export async function fetchBusinessBookingEcosystem(businessId: string): Promise<BusinessBookingEcosystemRow | null> {
  const { data, error } = await supabase
    .from('business_booking_ecosystem')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) throw error
  return data ? parseEcosystemRow(data) : null
}

export async function upsertBusinessBookingEcosystem(
  row: Omit<
    BusinessBookingEcosystemRow,
    | 'created_at'
    | 'updated_at'
    | 'settings'
    | 'ecosystem_notes'
    | 'baseline_no_show_rate_pct'
    | 'target_no_show_rate_pct'
  > & {
    baseline_no_show_rate_pct: number | null
    target_no_show_rate_pct: number
    ecosystem_notes: string | null
    settings: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await supabase.from('business_booking_ecosystem').upsert({
    business_id: row.business_id,
    booking_vertical: row.booking_vertical,
    resource_management_enabled: row.resource_management_enabled,
    no_show_suite_enabled: row.no_show_suite_enabled,
    baseline_no_show_rate_pct: row.baseline_no_show_rate_pct,
    target_no_show_rate_pct: row.target_no_show_rate_pct,
    ai_strict_confirmation_required: row.ai_strict_confirmation_required,
    ai_execution_mode: row.ai_execution_mode,
    ai_auto_action_types: row.ai_auto_action_types,
    ai_notes_enabled: row.ai_notes_enabled,
    ai_floor_plan_read_enabled: row.ai_floor_plan_read_enabled,
    ai_table_assignment_enabled: row.ai_table_assignment_enabled,
    ai_blocked_slots_enabled: row.ai_blocked_slots_enabled,
    customer_table_choice: row.customer_table_choice,
    default_table_assignment_mode: row.default_table_assignment_mode,
    ecosystem_notes: row.ecosystem_notes,
    settings: row.settings,
  })
  if (error) throw error
}
