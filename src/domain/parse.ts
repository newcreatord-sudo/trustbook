import type {
  BookingChatReadRow,
  BookingMessageRow,
  BookingRow,
  BookingStatus,
  BusinessClosureRow,
  BusinessOpeningWindowRow,
  BusinessRow,
  CustomerReliabilityRow,
  DepositStatus,
  FavoriteBusinessRow,
  NotificationRow,
  AiSuggestionRow,
  AiSuggestionAuditRow,
  ProfileRow,
  ReviewPublicRow,
  ReviewRow,
  ServiceRow,
  TeamMemberRow,
  UserRole,
  UserPreferencesRow,
  UserSecurityEventRow,
} from '@/domain/supabase'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asBoolean(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function asOneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  const s = asString(v)
  if (!s) return null
  return (allowed as readonly string[]).includes(s) ? (s as T) : null
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') return null
    out.push(x)
  }
  return out
}

function asDepositPolicyRule(v: unknown, fallback: { type: 'percentage' | 'fixed_amount'; value: number }) {
  if (!isRecord(v)) return fallback
  const t = asOneOf(v.type, ['percentage', 'fixed_amount'] as const) ?? fallback.type
  const raw = asNumber(v.value)
  const value = raw === null ? fallback.value : raw
  return { type: t, value }
}

export function isUserRole(v: unknown): v is UserRole {
  return v === 'cliente' || v === 'attivita'
}

export function isBookingStatus(v: unknown): v is BookingStatus {
  return (
    v === 'draft' ||
    v === 'requested' ||
    v === 'pending_approval' ||
    v === 'change_proposed' ||
    v === 'requires_deposit' ||
    v === 'pending_payment_setup' ||
    v === 'pending_deposit' ||
    v === 'confirmed' ||
    v === 'rejected' ||
    v === 'cancelled_by_customer' ||
    v === 'cancelled_by_business' ||
    v === 'completed' ||
    v === 'no_show' ||
    v === 'late_cancel'
  )
}

export function isDepositStatus(v: unknown): v is DepositStatus {
  return v === 'not_required' || v === 'required' || v === 'paid' || v === 'refunded' || v === 'forfeited'
}

export function parseProfileRow(v: unknown): ProfileRow {
  if (!isRecord(v)) throw new Error('Invalid profile')
  const id = asString(v.id)
  const role = v.role
  if (!id || !isUserRole(role)) throw new Error('Invalid profile')

  return {
    id,
    role,
    first_name: asString(v.first_name),
    last_name: asString(v.last_name),
    phone: asString(v.phone),
    avatar_url: asString(v.avatar_url),
    city: asString(v.city),
    lat: asNumber(v.lat),
    lng: asNumber(v.lng),
    account_status: asString(v.account_status) ?? 'active',
    created_at: asString(v.created_at) ?? new Date(0).toISOString(),
    updated_at: asString(v.updated_at) ?? new Date(0).toISOString(),
  }
}

export function safeParseProfileRow(v: unknown): ProfileRow | null {
  try {
    return parseProfileRow(v)
  } catch {
    return null
  }
}

export function parseBusinessRow(v: unknown): BusinessRow {
  if (!isRecord(v)) throw new Error('Invalid business')
  const id = asString(v.id)
  const owner_user_id = asString(v.owner_user_id)
  const name = asString(v.name)
  const category = asString(v.category)
  const lat = asNumber(v.lat)
  const lng = asNumber(v.lng)
  if (!id || !owner_user_id || !name || !category || lat === null || lng === null) throw new Error('Invalid business')

  const gallery_urls = asStringArray(v.gallery_urls) ?? []

  const approval_mode = asString(v.approval_mode)
  const deposit_rule = asString(v.deposit_rule)

  return {
    id,
    owner_user_id,
    name,
    category,
    description: asString(v.description),
    address_text: asString(v.address_text),
    postal_code: asString(v.postal_code),
    city: asString(v.city),
    timezone: asString(v.timezone) ?? 'Europe/Rome',
    phone: asString(v.phone),
    email: asString(v.email),
    website: asString(v.website),
    logo_url: asString(v.logo_url),
    gallery_urls,
    is_paused: asBoolean(v.is_paused) ?? false,
    listing_visible: asBoolean(v.listing_visible) ?? true,
    lat,
    lng,
    min_gap_min: asNumber(v.min_gap_min) ?? 0,
    approval_mode: approval_mode === 'auto' || approval_mode === 'manual' || approval_mode === 'risk_based' ? approval_mode : 'risk_based',
    required_reliability_min: asNumber(v.required_reliability_min) ?? 0,
    cancellation_window_min: asNumber(v.cancellation_window_min) ?? 120,
    booking_lead_time_min: asNumber(v.booking_lead_time_min) ?? 0,
    deposit_enabled: asBoolean(v.deposit_enabled) ?? false,
    deposit_rule: deposit_rule === 'off' || deposit_rule === 'all' || deposit_rule === 'risky_only' ? deposit_rule : 'all',
    deposit_risky_threshold: asNumber(v.deposit_risky_threshold) ?? 60,
    block_reliability_threshold: asNumber(v.block_reliability_threshold) ?? 15,
    auto_block_no_show_count: asNumber(v.auto_block_no_show_count) ?? 3,
    deposit_fixed_cents: asNumber(v.deposit_fixed_cents),
    deposit_percent: asNumber(v.deposit_percent),
    deposit_min_cents: asNumber(v.deposit_min_cents),
    deposit_max_cents: asNumber(v.deposit_max_cents),

    // New Deposit Engine Settings
    deposit_mode: asOneOf(v.deposit_mode, ['none', 'everyone', 'risk_based', 'dynamic'] as const) ?? 'none',
    deposit_value_type: asOneOf(v.deposit_value_type, ['percentage', 'fixed_amount'] as const) ?? 'percentage',
    deposit_green_rule: asDepositPolicyRule(v.deposit_green_rule, { type: 'percentage', value: 0 }),
    deposit_yellow_rule: asDepositPolicyRule(v.deposit_yellow_rule, { type: 'percentage', value: 20 }),
    deposit_red_rule: asDepositPolicyRule(v.deposit_red_rule, { type: 'percentage', value: 50 }),
    manual_approval_for_high_risk: asBoolean(v.manual_approval_for_high_risk) ?? true,
    cancellation_free_until_hours: asNumber(v.cancellation_free_until_hours) ?? 24,
    refund_policy: asOneOf(v.refund_policy, ['flexible', 'moderate', 'strict', 'non_refundable'] as const) ?? 'flexible',
    deposit_retained_on_no_show: asBoolean(v.deposit_retained_on_no_show) ?? true,
    deposit_retained_on_late_cancel: asBoolean(v.deposit_retained_on_late_cancel) ?? true,

    created_at: asString(v.created_at) ?? new Date(0).toISOString(),
    updated_at: asString(v.updated_at) ?? new Date(0).toISOString(),
  }
}

export function safeParseBusinessRow(v: unknown): BusinessRow | null {
  try {
    return parseBusinessRow(v)
  } catch {
    return null
  }
}

export function parseServiceRow(v: unknown): ServiceRow {
  if (!isRecord(v)) throw new Error('Invalid service')
  const id = asString(v.id)
  const business_id = asString(v.business_id)
  const name = asString(v.name)
  const duration_min = asNumber(v.duration_min)
  if (!id || !business_id || !name || duration_min === null) throw new Error('Invalid service')
  const bufBefore = asNumber(v.buffer_before_min)
  const bufAfter = asNumber(v.buffer_after_min)

  return {
    id,
    business_id,
    name,
    duration_min,
    buffer_before_min: bufBefore ?? undefined,
    buffer_after_min: bufAfter ?? undefined,
    price_cents: asNumber(v.price_cents),
    description: asString(v.description),
    is_active: asBoolean(v.is_active) ?? true,
    created_at: asString(v.created_at) ?? new Date(0).toISOString(),
    updated_at: asString(v.updated_at) ?? new Date(0).toISOString(),
  }
}

export function parseBookingRow(v: unknown): BookingRow {
  if (!isRecord(v)) throw new Error('Invalid booking')
  const id = asString(v.id)
  const customer_user_id = asString(v.customer_user_id)
  const business_id = asString(v.business_id)
  const service_id = asString(v.service_id)
  const start_at = asString(v.start_at)
  const end_at = asString(v.end_at)
  if (!id || !customer_user_id || !business_id || !service_id || !start_at || !end_at) throw new Error('Invalid booking')
  if (!isBookingStatus(v.status) || !isDepositStatus(v.deposit_status)) throw new Error('Invalid booking')

  return {
    id,
    customer_user_id,
    business_id,
    service_id,
    start_at,
    end_at,
    status: v.status,
    deposit_status: v.deposit_status,
    deposit_amount_cents: asNumber(v.deposit_amount_cents) ?? 0,
    created_at: asString(v.created_at) ?? new Date(0).toISOString(),
    updated_at: asString(v.updated_at) ?? new Date(0).toISOString(),
    confirmed_at: asString(v.confirmed_at),
    cancelled_at: asString(v.cancelled_at),
    completed_at: asString(v.completed_at),
    no_show_at: asString(v.no_show_at),
    approved_by_user_id: asString(v.approved_by_user_id),
    rejected_by_user_id: asString(v.rejected_by_user_id),
    rejection_reason: asString(v.rejection_reason),
    proposed_start_at: asString(v.proposed_start_at),
    proposed_end_at: asString(v.proposed_end_at),
    proposed_by_role: isUserRole(v.proposed_by_role) ? v.proposed_by_role : null,
    proposal_message: asString(v.proposal_message),
    proposal_created_at: asString(v.proposal_created_at),
    staff_id: asString(v.staff_id),
    checked_in_at: asString(v.checked_in_at),
    overbooked: asBoolean(v.overbooked),
  }
}

export function safeParseBookingRow(v: unknown): BookingRow | null {
  try {
    return parseBookingRow(v)
  } catch {
    return null
  }
}

export function parseUserPreferencesRow(v: unknown): UserPreferencesRow {
  if (!isRecord(v)) throw new Error('Invalid user preferences')
  const user_id = asString(v.user_id)
  if (!user_id) throw new Error('Invalid user preferences')
  const profile_visibility = asOneOf(v.profile_visibility, ['private', 'public'] as const) ?? 'private'
  const location_sharing = asOneOf(v.location_sharing, ['off', 'city', 'precise'] as const) ?? 'off'
  return {
    user_id,
    profile_visibility,
    location_sharing,
    notif_booking: asBoolean(v.notif_booking) ?? true,
    notif_deposit: asBoolean(v.notif_deposit) ?? true,
    notif_messages: asBoolean(v.notif_messages) ?? true,
    notif_marketing: asBoolean(v.notif_marketing) ?? false,
    notif_reminders: asBoolean(v.notif_reminders) ?? true,
    notif_owner_alerts: asBoolean(v.notif_owner_alerts) ?? true,
    channel_in_app: asBoolean(v.channel_in_app) ?? true,
    channel_email: asBoolean(v.channel_email) ?? true,
    channel_push: asBoolean(v.channel_push) ?? false,
    channel_sms: asBoolean(v.channel_sms) ?? false,
    voice_commands_enabled: asBoolean(v.voice_commands_enabled) ?? false,
    updated_at: asString(v.updated_at) ?? new Date(0).toISOString(),
  }
}

export function safeParseUserPreferencesRow(v: unknown): UserPreferencesRow | null {
  try {
    return parseUserPreferencesRow(v)
  } catch {
    return null
  }
}

export function parseUserSecurityEventRow(v: unknown): UserSecurityEventRow {
  if (!isRecord(v)) throw new Error('Invalid security event')
  const id = asString(v.id)
  const user_id = asString(v.user_id)
  const event_type = asOneOf(v.event_type, ['login', 'logout', 'password_changed'] as const)
  const source = asOneOf(v.source, ['app', 'recovery'] as const)
  const created_at = asString(v.created_at)
  if (!id || !user_id || !event_type || !source || !created_at) throw new Error('Invalid security event')
  return {
    id,
    user_id,
    event_type,
    source,
    device: asString(v.device),
    user_agent: asString(v.user_agent),
    ip: asString(v.ip),
    created_at,
  }
}

export function safeParseUserSecurityEventRow(v: unknown): UserSecurityEventRow | null {
  try {
    return parseUserSecurityEventRow(v)
  } catch {
    return null
  }
}

export function parseNotificationRow(v: unknown): NotificationRow {
  if (!isRecord(v)) throw new Error('Invalid notification')
  const id = asString(v.id)
  const recipient_user_id = asString(v.recipient_user_id)
  const kind = asString(v.kind)
  const title = asString(v.title)
  const dedupe_key = asString(v.dedupe_key)
  const created_at = asString(v.created_at)
  if (!id || !recipient_user_id || !kind || !title || !dedupe_key || !created_at) throw new Error('Invalid notification')
  return {
    id,
    recipient_user_id,
    business_id: asString(v.business_id),
    booking_id: asString(v.booking_id),
    kind,
    title,
    body: asString(v.body),
    link: asString(v.link),
    dedupe_key,
    read_at: asString(v.read_at),
    created_at,
    deliver_at: asString(v.deliver_at),
    email_sent_at: asString(v.email_sent_at),
  }
}

export function safeParseNotificationRow(v: unknown): NotificationRow | null {
  try {
    return parseNotificationRow(v)
  } catch {
    return null
  }
}

export function parseAiSuggestionRow(v: unknown): AiSuggestionRow {
  if (!isRecord(v)) throw new Error('Invalid ai suggestion')
  const id = asString(v.id)
  const business_id = asString(v.business_id)
  const kind = asString(v.kind)
  const priority = asNumber(v.priority)
  const title = asString(v.title)
  const action_type = asString(v.action_type)
  let status = asString(v.status)
  const generated_at = asString(v.generated_at)
  if (!id || !business_id || !kind || priority === null || !title || !action_type || !status || !generated_at) throw new Error('Invalid ai suggestion')
  if (status === 'active') status = 'new'
  if (status !== 'new' && status !== 'read' && status !== 'applied' && status !== 'dismissed') throw new Error('Invalid ai suggestion')
  return {
    id,
    business_id,
    kind,
    priority,
    title,
    explanation: asString(v.explanation) ?? '',
    evidence: (v as Record<string, unknown>).evidence ?? [],
    expected_impact: asString(v.expected_impact),
    action_type,
    action_payload: (v as Record<string, unknown>).action_payload ?? {},
    status,
    generated_at,
    read_at: asString(v.read_at),
    dismissed_at: asString(v.dismissed_at),
    dismissed_by_user_id: asString(v.dismissed_by_user_id),
    applied_at: asString(v.applied_at),
    applied_by_user_id: asString(v.applied_by_user_id),
  }
}

export function safeParseAiSuggestionRow(v: unknown): AiSuggestionRow | null {
  try {
    return parseAiSuggestionRow(v)
  } catch {
    return null
  }
}

export function parseAiSuggestionAuditRow(v: unknown): AiSuggestionAuditRow {
  if (!isRecord(v)) throw new Error('Invalid ai suggestion audit')
  const id = asString(v.id)
  const business_id = asString(v.business_id)
  const user_id = asString(v.user_id)
  const action_type = asString(v.action_type)
  const result = asString(v.result)
  const created_at = asString(v.created_at)
  if (!id || !business_id || !user_id || !action_type || !result || !created_at) throw new Error('Invalid ai suggestion audit')
  if (result !== 'success' && result !== 'fail') throw new Error('Invalid ai suggestion audit')
  return {
    id,
    suggestion_id: asString(v.suggestion_id),
    business_id,
    user_id,
    action_type,
    action_payload: (v as Record<string, unknown>).action_payload ?? {},
    result,
    error: asString(v.error),
    created_at,
  }
}

export function safeParseAiSuggestionAuditRow(v: unknown): AiSuggestionAuditRow | null {
  try {
    return parseAiSuggestionAuditRow(v)
  } catch {
    return null
  }
}

export function parseCustomerReliabilityRow(v: unknown): CustomerReliabilityRow {
  if (!isRecord(v)) throw new Error('Invalid reliability')
  const user_id = asString(v.user_id)
  const score = asNumber(v.score)
  const stars = asNumber(v.stars)
  if (!user_id || score === null || stars === null) throw new Error('Invalid reliability')
  return {
    user_id,
    score,
    stars,
    completed_count: asNumber(v.completed_count) ?? 0,
    late_cancel_count: asNumber(v.late_cancel_count) ?? 0,
    no_show_count: asNumber(v.no_show_count) ?? 0,
    last_star_awarded_at: asString(v.last_star_awarded_at),
    updated_at: asString(v.updated_at) ?? new Date(0).toISOString(),
  }
}

export function safeParseCustomerReliabilityRow(v: unknown): CustomerReliabilityRow | null {
  try {
    return parseCustomerReliabilityRow(v)
  } catch {
    return null
  }
}

export function parseTeamMemberRow(v: unknown): TeamMemberRow {
  if (!isRecord(v)) throw new Error('Invalid team member')
  const id = asString(v.id)
  const business_id = asString(v.business_id)
  const user_id = asString(v.user_id)
  const role = asString(v.role)
  if (!id || !business_id || !user_id || (role !== 'owner' && role !== 'staff')) throw new Error('Invalid team member')
  return {
    id,
    business_id,
    user_id,
    role,
    created_at: asString(v.created_at) ?? new Date(0).toISOString(),
  }
}

export function parseBusinessOpeningWindowRow(v: unknown): BusinessOpeningWindowRow {
  if (!isRecord(v)) throw new Error('Invalid opening window')
  const id = asString(v.id)
  const business_id = asString(v.business_id)
  const weekday = asNumber(v.weekday)
  const start_time = asString(v.start_time)
  const end_time = asString(v.end_time)
  if (!id || !business_id || weekday === null || !start_time || !end_time) throw new Error('Invalid opening window')
  return {
    id,
    business_id,
    weekday,
    start_time,
    end_time,
    created_at: asString(v.created_at) ?? new Date(0).toISOString(),
    updated_at: asString(v.updated_at) ?? new Date(0).toISOString(),
  }
}

export function parseBusinessClosureRow(v: unknown): BusinessClosureRow {
  if (!isRecord(v)) throw new Error('Invalid closure')
  const id = asString(v.id)
  const business_id = asString(v.business_id)
  const start_at = asString(v.start_at)
  const end_at = asString(v.end_at)
  if (!id || !business_id || !start_at || !end_at) throw new Error('Invalid closure')
  return {
    id,
    business_id,
    start_at,
    end_at,
    reason: asString(v.reason),
    created_at: asString(v.created_at) ?? new Date(0).toISOString(),
    updated_at: asString(v.updated_at) ?? new Date(0).toISOString(),
  }
}

export function parseBookingMessageRow(v: unknown): BookingMessageRow {
  if (!isRecord(v)) throw new Error('Invalid booking message')
  const id = asString(v.id)
  const booking_id = asString(v.booking_id)
  const sender_user_id = asString(v.sender_user_id)
  const body = asString(v.body)
  const created_at = asString(v.created_at)
  if (!id || !booking_id || !sender_user_id || !body || !created_at) throw new Error('Invalid booking message')
  return { id, booking_id, sender_user_id, body, created_at }
}

export function parseBookingChatReadRow(v: unknown): BookingChatReadRow {
  if (!isRecord(v)) throw new Error('Invalid booking chat read')
  const booking_id = asString(v.booking_id)
  const user_id = asString(v.user_id)
  const last_read_at = asString(v.last_read_at)
  if (!booking_id || !user_id || !last_read_at) throw new Error('Invalid booking chat read')
  return { booking_id, user_id, last_read_at }
}

export function parseFavoriteBusinessRow(v: unknown): FavoriteBusinessRow {
  if (!isRecord(v)) throw new Error('Invalid favorite')
  const id = asString(v.id)
  const user_id = asString(v.user_id)
  const business_id = asString(v.business_id)
  const created_at = asString(v.created_at)
  if (!id || !user_id || !business_id || !created_at) throw new Error('Invalid favorite')
  return { id, user_id, business_id, created_at }
}

export function parseReviewRow(v: unknown): ReviewRow {
  if (!isRecord(v)) throw new Error('Invalid review')
  const id = asString(v.id)
  const booking_id = asString(v.booking_id)
  const business_id = asString(v.business_id)
  const author_user_id = asString(v.author_user_id)
  const direction = asString(v.direction)
  const rating = asNumber(v.rating)
  const created_at = asString(v.created_at)
  if (!id || !booking_id || !business_id || !author_user_id || !direction || rating === null || !created_at) throw new Error('Invalid review')
  if (direction !== 'customer_to_business' && direction !== 'business_to_customer') throw new Error('Invalid review')
  return {
    id,
    booking_id,
    business_id,
    author_user_id,
    direction,
    rating,
    comment: asString(v.comment),
    created_at,
  }
}

/** Recensioni caricate senza `author_user_id` (listing pubblico). */
export function parseReviewPublicRow(v: unknown): ReviewPublicRow {
  if (!isRecord(v)) throw new Error('Invalid review')
  const id = asString(v.id)
  const booking_id = asString(v.booking_id)
  const business_id = asString(v.business_id)
  const direction = asString(v.direction)
  const rating = asNumber(v.rating)
  const created_at = asString(v.created_at)
  if (!id || !booking_id || !business_id || !direction || rating === null || !created_at) throw new Error('Invalid review')
  if (direction !== 'customer_to_business' && direction !== 'business_to_customer') throw new Error('Invalid review')
  return {
    id,
    booking_id,
    business_id,
    direction,
    rating,
    comment: asString(v.comment),
    created_at,
  }
}
