import { addDays, startOfDay } from '@/utils/calendar'
import {
  addDaysToDateParts,
  calendarPartsInTimeZone,
  zonedDateTimeToUtcIso,
} from '@/utils/timezone'
import { SCHEDULER_OCCUPYING_BOOKING_STATUSES } from '@/domain/bookingOccupyingStatuses'

export type Slot = { startAt: string; endAt: string }

/** Allineato al motore server (create_booking_v3 + overlap guard). Origine: `domain/bookingOccupyingStatuses`. */
export const OCCUPYING_BOOKING_STATUSES = SCHEDULER_OCCUPYING_BOOKING_STATUSES

/**
 * Predicato allineato a create_booking_v3 sul controllo overlap prenotazioni:
 * `(p_staff_id is null or staff_id = p_staff_id)` con NULL gestito come in SQL.
 */
export function occupyingBookingConflictsWithStaffChoice(
  selectedStaffId: string | null,
  bookingStaffId: string | null | undefined,
): boolean {
  if (selectedStaffId === null) return true
  return bookingStaffId != null && bookingStaffId === selectedStaffId
}

/** Blocco agenda manuale: `(staff_id is null or staff_id = p_staff_id)` con p_staff_id null → solo blocchi globali. */
export function blockedSlotAppliesToStaffChoice(selectedStaffId: string | null, blockedStaffId: string | null): boolean {
  if (blockedStaffId === null) return true
  if (selectedStaffId === null) return false
  return blockedStaffId === selectedStaffId
}

/**
 * Allineato a create_booking_v3 su `staff_closures`: overlap solo su orario servizio (senza buffer).
 * Se `p_staff_id` è null il server non applica questo controllo → qui non blocca mai.
 */
export function staffClosureBlocksStaffBooking(params: {
  selectedStaffId: string | null
  closureStaffId: string
  closureStartAt: string
  closureEndAt: string
  slotStartAt: string
  slotEndAt: string
}): boolean {
  if (params.selectedStaffId === null) return false
  if (params.closureStaffId !== params.selectedStaffId) return false
  return isSlotOverlapping(
    { startAt: params.closureStartAt, endAt: params.closureEndAt },
    { startAt: params.slotStartAt, endAt: params.slotEndAt },
  )
}

export function isSlotOverlapping(a: Slot, b: Slot): boolean {
  const aStart = new Date(a.startAt).getTime()
  const aEnd = new Date(a.endAt).getTime()
  const bStart = new Date(b.startAt).getTime()
  const bEnd = new Date(b.endAt).getTime()
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false
  return aStart < bEnd && aEnd > bStart
}

/** Finestre buffer come create_booking_v3 (solo sul nuovo slot). */
export function slotWithServiceBuffers(slot: Slot, bufferBeforeMin: number, bufferAfterMin: number): Slot {
  const bBefore = Math.max(0, Math.floor(bufferBeforeMin))
  const bAfter = Math.max(0, Math.floor(bufferAfterMin))
  const startMs = new Date(slot.startAt).getTime() - bBefore * 60_000
  const endMs = new Date(slot.endAt).getTime() + bAfter * 60_000
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return slot
  return { startAt: new Date(startMs).toISOString(), endAt: new Date(endMs).toISOString() }
}

export function listNextDays(days: number, from: Date = new Date()): Date[] {
  const base = startOfDay(from)
  const count = Math.max(0, Math.min(60, Math.floor(days)))
  const out: Date[] = []
  for (let i = 0; i < count; i++) out.push(addDays(base, i))
  return out
}

/** Prossimi N giorni civili nel fuso attività (ancora UTC noon locale business per stabilità UI). */
export function listNextDaysInTimeZone(count: number, timeZone: string, from: Date = new Date()): Date[] {
  const n = Math.max(0, Math.min(60, Math.floor(count)))
  const baseParts = calendarPartsInTimeZone(from, timeZone)
  const out: Date[] = []
  for (let i = 0; i < n; i++) {
    const p = addDaysToDateParts(baseParts, i)
    const iso = zonedDateTimeToUtcIso({ timeZone, parts: p, hour: 12, minute: 0 })
    out.push(new Date(iso))
  }
  return out
}
