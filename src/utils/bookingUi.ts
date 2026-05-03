import type { BookingStatus, DepositStatus } from '@/domain/supabase'

export function isClosedBookingStatus(status: BookingStatus): boolean {
  return (
    status === 'completed' ||
    status === 'no_show' ||
    status === 'rejected' ||
    status === 'cancelled_by_business' ||
    status === 'cancelled_by_customer' ||
    status === 'late_cancel'
  )
}

export function bookingStatusLabel(status: BookingStatus): string {
  if (status === 'draft') return 'Bozza'
  if (status === 'requested') return 'Richiesta inviata'
  if (status === 'pending_approval') return 'In attesa di approvazione'
  if (status === 'change_proposed') return 'Cambio orario proposto'
  if (status === 'requires_deposit') return 'Caparra richiesta'
  if (status === 'pending_payment_setup') return 'In attesa configurazione pagamento'
  if (status === 'pending_deposit') return 'In attesa caparra'
  if (status === 'confirmed') return 'Confermata'
  if (status === 'rejected') return 'Rifiutata'
  if (status === 'cancelled_by_customer') return 'Annullata (da te)'
  if (status === 'cancelled_by_business') return 'Annullata (attività)'
  if (status === 'completed') return 'Completata'
  if (status === 'no_show') return 'No-show'
  return 'Cancellazione tardiva'
}

export function depositStatusLabel(status: DepositStatus): string {
  if (status === 'not_required') return 'Non richiesta'
  if (status === 'required') return 'Richiesta'
  if (status === 'paid') return 'Pagata'
  if (status === 'refunded') return 'Rimborsata'
  return 'Trattenuta'
}

