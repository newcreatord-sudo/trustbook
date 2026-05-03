/**
 * Stati prenotazione che occupano agenda nel motore server (create_booking_v3,
 * internal_validate_booking_slot_interval, trigger ensure_booking_no_overlap da migrazione 0066).
 * Qualsiasi modifica qui va riflessa nelle migrazioni SQL corrispondenti.
 */
export const SCHEDULER_OCCUPYING_BOOKING_STATUSES = [
  'requested',
  'pending_approval',
  'pending_deposit',
  'requires_deposit',
  'pending_payment_setup',
  'confirmed',
  'change_proposed',
  'completed',
  'no_show',
  'late_cancel',
] as const

export type SchedulerOccupyingBookingStatus = (typeof SCHEDULER_OCCUPYING_BOOKING_STATUSES)[number]
