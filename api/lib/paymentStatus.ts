export type PaymentStatus = 'created' | 'paid' | 'refunded' | 'forfeited'

export function asPaymentStatus(v: unknown): PaymentStatus | null {
  if (v === 'created' || v === 'paid' || v === 'refunded' || v === 'forfeited') return v
  return null
}

export function canTransitionPaymentStatus(current: PaymentStatus, next: PaymentStatus): boolean {
  if (current === next) return true
  if (current === 'created' && next === 'paid') return true
  if (current === 'paid' && (next === 'refunded' || next === 'forfeited')) return true
  return false
}
