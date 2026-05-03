export type UserRole = 'cliente' | 'attivita'

export type ApprovalMode = 'auto' | 'manual' | 'risk_based'

export type DepositRule = 'off' | 'all' | 'risky_only'

export type BookingStatus =
  | 'draft'
  | 'requested'
  | 'pending_approval'
  | 'change_proposed'
  | 'pending_deposit'
  | 'requires_deposit'
  | 'pending_payment_setup'
  | 'confirmed'
  | 'rejected'
  | 'cancelled_by_customer'
  | 'cancelled_by_business'
  | 'completed'
  | 'no_show'
  | 'late_cancel'

export type DepositStatus = 'not_required' | 'required' | 'paid' | 'refunded' | 'forfeited'

export type ReviewDirection = 'customer_to_business' | 'business_to_customer'

export type TeamMemberRole = 'owner' | 'staff'

export type BookingEventVisibility = 'all' | 'business_only'

export type BookingPaymentProvider = 'stripe'
export type BookingPaymentKind = 'deposit'
export type BookingPaymentStatus = 'created' | 'paid' | 'refunded' | 'forfeited'

export type KnownNotificationKind =
  | 'booking_requested'
  | 'booking_sent'
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'deposit_required'
  | 'deposit_paid'
  | 'time_change'
  | 'time_change_request'
  | 'cancelled'

export type AiSuggestionStatus = 'new' | 'read' | 'applied' | 'dismissed'

export interface AiSuggestionRow {
  id: string
  business_id: string
  kind: string
  priority: number
  title: string
  explanation: string
  evidence: unknown
  expected_impact: string | null
  action_type: string
  action_payload: unknown
  status: AiSuggestionStatus
  generated_at: string
  read_at?: string | null
  dismissed_at?: string | null
  dismissed_by_user_id?: string | null
  applied_at: string | null
  applied_by_user_id: string | null
}

export interface AiSuggestionAuditRow {
  id: string
  suggestion_id: string | null
  business_id: string
  user_id: string
  action_type: string
  action_payload: unknown
  result: 'success' | 'fail'
  error: string | null
  created_at: string
}

export interface ProfileRow {
  id: string
  role: UserRole
  first_name: string | null
  last_name: string | null
  phone: string | null
  avatar_url: string | null
  city: string | null
  lat: number | null
  lng: number | null
  account_status: string
  created_at: string
  updated_at: string
}

export type DepositMode = 'none' | 'everyone' | 'risk_based' | 'dynamic'
export type DepositValueType = 'percentage' | 'fixed_amount'
export type RefundPolicy = 'flexible' | 'moderate' | 'strict' | 'non_refundable'

export interface DepositPolicyRule {
  type: DepositValueType
  value: number
}

export interface BusinessRow {
  id: string
  owner_user_id: string
  name: string
  category: string
  description: string | null
  address_text: string | null
  postal_code: string | null
  city: string | null
  timezone?: string
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  gallery_urls: string[]
  is_paused: boolean
  listing_visible: boolean
  lat: number
  lng: number
  min_gap_min: number
  approval_mode: ApprovalMode
  required_reliability_min: number
  cancellation_window_min: number
  booking_lead_time_min: number
  deposit_risky_threshold: number
  block_reliability_threshold: number
  auto_block_no_show_count: number
  created_at: string
  updated_at: string

  // Legacy deposit settings
  deposit_enabled: boolean
  deposit_rule: DepositRule
  deposit_fixed_cents: number | null
  deposit_percent: number | null
  deposit_min_cents: number | null
  deposit_max_cents: number | null

  // New Deposit Policy Engine settings
  deposit_mode: DepositMode
  deposit_value_type: DepositValueType
  deposit_green_rule: DepositPolicyRule
  deposit_yellow_rule: DepositPolicyRule
  deposit_red_rule: DepositPolicyRule
  manual_approval_for_high_risk: boolean
  cancellation_free_until_hours: number
  refund_policy: RefundPolicy
  deposit_retained_on_no_show: boolean
  deposit_retained_on_late_cancel: boolean
}


export interface ServiceRow {
  id: string
  business_id: string
  name: string
  duration_min: number
  /** Tempo tecnico prima dell’appuntamento (create_booking_v3 / disponibilità). */
  buffer_before_min?: number
  /** Tempo tecnico dopo l’appuntamento. */
  buffer_after_min?: number
  price_cents: number | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BusinessOpeningWindowRow {
  id: string
  business_id: string
  weekday: number
  start_time: string
  end_time: string
  created_at: string
  updated_at: string
}

export interface BusinessClosureRow {
  id: string
  business_id: string
  start_at: string
  end_at: string
  reason: string | null
  created_at: string
  updated_at: string
}

export interface BookingMessageRow {
  id: string
  booking_id: string
  sender_user_id: string
  body: string
  created_at: string
}

export interface BookingChatReadRow {
  booking_id: string
  user_id: string
  last_read_at: string
}

export interface FavoriteBusinessRow {
  id: string
  user_id: string
  business_id: string
  created_at: string
}

export interface BookingRow {
  id: string
  customer_user_id: string
  business_id: string
  service_id: string
  start_at: string
  end_at: string
  status: BookingStatus
  deposit_status: DepositStatus
  deposit_amount_cents: number
  created_at: string
  updated_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  completed_at: string | null
  no_show_at: string | null
  approved_by_user_id: string | null
  rejected_by_user_id: string | null
  rejection_reason: string | null
  proposed_start_at: string | null
  proposed_end_at: string | null
  proposed_by_role: UserRole | null
  proposal_message: string | null
  proposal_created_at: string | null
  /** Smart agenda / migration 0054 */
  staff_id?: string | null
  checked_in_at?: string | null
  overbooked?: boolean | null
}

export interface ReviewRow {
  id: string
  booking_id: string
  business_id: string
  author_user_id: string
  direction: ReviewDirection
  rating: number
  comment: string | null
  created_at: string
}

/** Listing pubblico / pagina attività: senza autore per ridurre leakage UUID lato client. */
export type ReviewPublicRow = Omit<ReviewRow, 'author_user_id'>

export interface BookingInternalNoteRow {
  booking_id: string
  body: string
  updated_by_user_id: string | null
  updated_at: string
}

export interface BusinessCustomerTagRow {
  id: string
  business_id: string
  customer_user_id: string
  tag: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface BookingEventRow {
  id: string
  booking_id: string
  business_id: string
  kind: string
  visibility: BookingEventVisibility
  actor_user_id: string | null
  payload: unknown
  created_at: string
}

export interface TeamMemberRow {
  id: string
  business_id: string
  user_id: string
  role: TeamMemberRole
  created_at: string
}

/** Riga RPC `list_bookable_staff_for_booking` (booking pubblico). */
export interface BookableStaffOptionRow {
  id: string
  display_name: string
  color: string
}

/** Payload verso `create_booking_v3` / `create_booking_v3_with_resource_assignment` (flusso pubblico). */
export interface CreateBookingPayload {
  serviceId: string
  startAt: string
  endAt: string
  staffId: string | null
  /** Se valorizzato, il server crea booking + risorsa nello stesso RPC (no booking orfano). */
  resourceAssignment?:
    | { kind: 'explicit'; resourceId: string; partySize: number }
    | { kind: 'auto'; partySize: number }
}

export interface NotificationRow {
  id: string
  recipient_user_id: string
  business_id: string | null
  booking_id: string | null
  kind: string
  title: string
  body: string | null
  link: string | null
  dedupe_key: string
  read_at: string | null
  created_at: string
  deliver_at?: string | null
  email_sent_at?: string | null
}

export type ProfileVisibility = 'private' | 'public'
export type LocationSharing = 'off' | 'city' | 'precise'

export interface UserPreferencesRow {
  user_id: string
  profile_visibility: ProfileVisibility
  location_sharing: LocationSharing
  notif_booking: boolean
  notif_deposit: boolean
  notif_messages: boolean
  notif_marketing: boolean
  notif_reminders: boolean
  notif_owner_alerts: boolean
  channel_in_app: boolean
  channel_email: boolean
  channel_push: boolean
  channel_sms: boolean
  voice_commands_enabled: boolean
  updated_at: string
}

export interface BookingPaymentRow {
  id: string
  booking_id: string
  provider: BookingPaymentProvider
  kind: BookingPaymentKind
  amount_cents: number
  currency: string
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  status: BookingPaymentStatus
  created_at: string
  updated_at: string
}

export interface CustomerReliabilityRow {
  user_id: string
  score: number
  stars: number
  completed_count: number
  late_cancel_count: number
  no_show_count: number
  last_star_awarded_at: string | null
  updated_at: string
}

export interface ReliabilityEventRow {
  id: string
  user_id: string
  booking_id: string | null
  kind: string
  delta: number
  created_at: string
}

export interface OnboardingDraftRow {
  user_id: string
  kind: 'business'
  payload: unknown
  updated_at: string
}

export type SecurityEventType = 'login' | 'logout' | 'password_changed'
export type SecurityEventSource = 'app' | 'recovery'

export interface UserSecurityEventRow {
  id: string
  user_id: string
  event_type: SecurityEventType
  source: SecurityEventSource
  device: string | null
  user_agent: string | null
  ip: string | null
  created_at: string
}

export type BillingInterval = 'monthly' | 'yearly' | 'lifetime'
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing'

export interface PlatformSettingsRow {
  id: string
  platform_fee_percent: number
  platform_fee_fixed_cents: number
  updated_at: string
}

export interface SubscriptionPlanRow {
  id: string
  target_audience: 'business' | 'customer'
  name: string
  description: string | null
  price_cents: number
  billing_interval: BillingInterval
  features: Record<string, unknown>
  is_active: boolean
  created_at: string
  stripe_product_id: string | null
  stripe_price_id: string | null
  mollie_sku: string | null
}

export interface BusinessSubscriptionRow {
  id: string
  business_id: string
  plan_id: string
  status: SubscriptionStatus
  current_period_end: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
}

export interface CustomerSubscriptionRow {
  id: string
  customer_id: string
  plan_id: string
  status: SubscriptionStatus
  current_period_end: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
}

// Domain-level aliases for consistent naming in app modules.
export type User = ProfileRow
export type Business = BusinessRow
export type Booking = BookingRow
export type Service = ServiceRow
export type Staff = TeamMemberRow
export type Payment = BookingPaymentRow
export type Reliability = CustomerReliabilityRow
