import { SupabaseClient } from '@supabase/supabase-js'
import { clampScore, computeEffectiveReliability } from '@/utils/reliability'

export type RiskLevel = 'green' | 'yellow' | 'red'

export type RiskBadgeTone = 'success' | 'warning' | 'danger'

/**
 * Score effettivo (stesso modello di {@link computeEffectiveReliability}), clamp 0–100.
 */
export function calculateReliabilityScore(
  baseScore: number,
  modifiers: {
    stars?: number
    noShowCount?: number
    lateCancelCount?: number
  } = {},
): number {
  return computeEffectiveReliability({
    baseScore,
    stars: modifiers.stars,
    noShowCount: modifiers.noShowCount,
    lateCancelCount: modifiers.lateCancelCount,
  }).effectiveScore
}

/**
 * Restituisce il Risk Level (green/yellow/red) basato sullo score.
 * Regole: Green (80-100), Yellow (50-79), Red (0-49)
 */
export function getRiskLevel(score: number): RiskLevel {
  const s = clampScore(score)
  if (s >= 80) return 'green'
  if (s >= 50) return 'yellow'
  return 'red'
}

/** Dashboard attività: linguaggio professionale (evita enum tecnici inglesi). */
export function ownerRiskPresentation(level: RiskLevel): { labelIt: string; badgeTone: RiskBadgeTone } {
  switch (level) {
    case 'green':
      return { labelIt: 'Nella norma', badgeTone: 'success' }
    case 'yellow':
      return { labelIt: 'Moderato', badgeTone: 'warning' }
    case 'red':
      return { labelIt: 'Elevato', badgeTone: 'danger' }
  }
}

/** Area cliente: formulazioni chiare e non punitive. */
export function customerRiskPresentation(level: RiskLevel): { labelIt: string; badgeTone: RiskBadgeTone } {
  switch (level) {
    case 'green':
      return { labelIt: 'Nella norma', badgeTone: 'success' }
    case 'yellow':
      return { labelIt: 'In evoluzione', badgeTone: 'warning' }
    case 'red':
      return { labelIt: 'Da migliorare', badgeTone: 'danger' }
  }
}

/**
 * RPC con validazione server-side (stato booking, ruoli, delta atteso).
 * Preferisci i trigger su `bookings`; questi wrapper servono solo a casi eccezionali.
 */
export async function updateReliabilityAfterBookingCompleted(supabase: SupabaseClient, userId: string, bookingId: string) {
  return await supabase.rpc('apply_reliability_delta', { p_user_id: userId, p_booking_id: bookingId, p_kind: 'completed', p_delta: 2 })
}

export async function updateReliabilityAfterNoShow(supabase: SupabaseClient, userId: string, bookingId: string) {
  return await supabase.rpc('apply_reliability_delta', { p_user_id: userId, p_booking_id: bookingId, p_kind: 'no_show', p_delta: -20 })
}

export async function updateReliabilityAfterLateCancel(supabase: SupabaseClient, userId: string, bookingId: string) {
  return await supabase.rpc('apply_reliability_delta', { p_user_id: userId, p_booking_id: bookingId, p_kind: 'late_cancel', p_delta: -10 })
}

export async function updateReliabilityAfterNormalCancel(supabase: SupabaseClient, userId: string, bookingId: string) {
  return await supabase.rpc('apply_reliability_delta', { p_user_id: userId, p_booking_id: bookingId, p_kind: 'on_time_cancel', p_delta: 1 })
}

/**
 * Valuta se una prenotazione dovrebbe essere approvata automaticamente
 * basato sulle regole di business e sul livello di rischio.
 */
export function shouldAutoApproveBooking(riskLevel: RiskLevel, businessRequiresApprovalForRed: boolean): boolean {
  if (riskLevel === 'red' && businessRequiresApprovalForRed) return false
  return true
}

/**
 * Valuta se una prenotazione necessita di approvazione manuale.
 */
export function shouldRequireManualApproval(riskLevel: RiskLevel, businessRequiresApprovalForRed: boolean): boolean {
  return !shouldAutoApproveBooking(riskLevel, businessRequiresApprovalForRed)
}

/**
 * Indica se il business dovrebbe suggerire il pagamento di una caparra.
 */
export function shouldSuggestDeposit(riskLevel: RiskLevel, depositMode: string): boolean {
  if (depositMode === 'none') return false
  if (depositMode === 'everyone') return true
  if (depositMode === 'risk_based') return riskLevel !== 'green'
  if (depositMode === 'dynamic') return riskLevel !== 'green'
  return false
}

/**
 * Suggerisce slot alternativi più sicuri per clienti ad alto rischio
 * (es: ore meno affollate dove un no-show impatta meno).
 */
export function suggestSaferSlotForRiskyCustomer(
  riskLevel: RiskLevel, 
  availableSlots: Array<{ start: string, isPeakHour: boolean }>
): Array<{ start: string, isPeakHour: boolean }> {
  if (riskLevel !== 'red') return availableSlots
  
  // Ritorna prima gli slot che non sono di punta
  return [...availableSlots].sort((a, b) => {
    if (a.isPeakHour && !b.isPeakHour) return 1
    if (!a.isPeakHour && b.isPeakHour) return -1
    return 0
  })
}
