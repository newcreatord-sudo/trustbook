import { AlertTriangle, ArrowRight, BadgeInfo, CalendarClock, CreditCard, PauseCircle } from 'lucide-react'
import type { BookingRow, BusinessOpeningWindowRow, BusinessRow, ServiceRow } from '@/domain/supabase'
import { cn } from '@/lib/utils'
import Button from '@/shared/ui/Button'

type AlertTone = 'danger' | 'warning' | 'info'

type AlertItem = {
  key: string
  tone: AlertTone
  title: string
  description: string
  ctaLabel?: string
  onCta?: () => void
  icon: 'pause' | 'pending' | 'deposit' | 'setup' | 'info'
}

function isClosedStatus(status: string): boolean {
  return (
    status === 'completed' ||
    status === 'no_show' ||
    status === 'late_cancel' ||
    status === 'rejected' ||
    String(status).startsWith('cancelled')
  )
}

function iconFor(k: AlertItem['icon']) {
  if (k === 'pause') return PauseCircle
  if (k === 'pending') return CalendarClock
  if (k === 'deposit') return CreditCard
  if (k === 'setup') return AlertTriangle
  return BadgeInfo
}

function classesFor(tone: AlertTone) {
  if (tone === 'danger') return 'border-red-500/30 bg-red-500/5 text-white hover:bg-red-500/10'
  if (tone === 'warning') return 'border-amber-500/30 bg-amber-500/5 text-white hover:bg-amber-500/10'
  return 'border-[#4F7CFF]/30 bg-[#4F7CFF]/5 text-white hover:bg-[#4F7CFF]/10'
}

function iconColorFor(tone: AlertTone) {
  if (tone === 'danger') return 'text-red-400'
  if (tone === 'warning') return 'text-amber-400'
  return 'text-[#4F7CFF]'
}

export default function BusinessAlertsPanel(props: {
  business: BusinessRow
  services: ServiceRow[]
  openingWindows: BusinessOpeningWindowRow[]
  bookings: BookingRow[]
  /** Evita avvisi dalla precedente attività durante il reload */
  alertsLoading?: boolean
  /** CT verso impostazioni/servizi/orari solo per owner */
  isOwner?: boolean
  onGoToSettings: () => void
  onGoToServices: () => void
  onGoToHours: () => void
  onGoToPending: () => void
  onGoToDeposits: () => void
  onGoToPayments?: () => void
}) {
  const isOwner = props.isOwner ?? true

  if (props.alertsLoading) {
    return (
      <div className="mt-6 space-y-3">
        <div className="tb-kicker">PRIORITÀ</div>
        <div className="grid grid-cols-1 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 animate-pulse">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="mt-0.5 h-10 w-10 shrink-0 rounded-xl bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 rounded bg-white/10" />
                    <div className="h-3 w-full max-w-md rounded bg-white/10" />
                  </div>
                </div>
                <div className="h-9 w-28 shrink-0 rounded-lg bg-white/10 hidden sm:block" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const b = props.business
  const pendingCount = props.bookings.filter(
    (x) => x.status === 'pending_approval' || x.status === 'requested' || x.status === 'change_proposed',
  ).length
  const depositCount = props.bookings.filter(
    (x) => !isClosedStatus(x.status) && (x.status === 'pending_deposit' || x.status === 'requires_deposit' || x.status === 'pending_payment_setup' || x.deposit_status === 'required'),
  ).length

  const hasServices = props.services.length > 0
  const hasHours = props.openingWindows.length > 0
  const hasContact = Boolean((b.phone ?? '').trim() || (b.email ?? '').trim())
  const hasLocation = Boolean((b.city ?? '').trim() && (b.address_text ?? '').trim())
  const hasDescription = Boolean((b.description ?? '').trim())

  const items: AlertItem[] = []

  if (b.is_paused) {
    items.push({
      key: 'paused',
      tone: 'warning',
      title: 'Attività in pausa',
      description: isOwner
        ? 'I clienti ti vedono ma non possono prenotare. Disattiva la pausa quando sei pronta.'
        : 'I clienti vedono l’attività ma non possono prenotare. Solo l’owner può disattivare la pausa.',
      ...(isOwner ? { ctaLabel: 'Gestisci pausa', onCta: props.onGoToSettings } : {}),
      icon: 'pause',
    })
  }

  if (pendingCount > 0) {
    items.push({
      key: 'pending',
      tone: 'danger',
      title: `${pendingCount} richieste in attesa`,
      description: 'Conferma o rifiuta dalla lista appuntamenti: il cliente riceve subito una risposta.',
      ctaLabel: 'Vai alle richieste',
      onCta: props.onGoToPending,
      icon: 'pending',
    })
  }

  if (depositCount > 0) {
    items.push({
      key: 'deposit',
      tone: 'info',
      title: `${depositCount} caparre da gestire`,
      description: 'Vedi chi deve ancora pagare la caparra e lo stato dei bonifici/card.',
      ctaLabel: 'Vedi caparre',
      onCta: props.onGoToDeposits,
      icon: 'deposit',
    })

    if (props.onGoToPayments) {
      items.push({
        key: 'payments',
        tone: 'info',
        title: 'Pagamenti caparre',
        description: 'Riepilogo caparre: pagate, rimborsate o trattenute secondo le regole dell’attività.',
        ctaLabel: 'Apri pagamenti',
        onCta: props.onGoToPayments,
        icon: 'deposit',
      })
    }
  }

  if (!hasServices) {
    items.push({
      key: 'services',
      tone: 'warning',
      title: 'Servizi non configurati',
      description: isOwner
        ? 'Serve almeno un servizio con nome e durata: senza non compaiono slot prenotabili.'
        : 'Manca almeno un servizio configurato: solo l’owner può aggiungerli.',
      ...(isOwner ? { ctaLabel: 'Configura servizi', onCta: props.onGoToServices } : {}),
      icon: 'setup',
    })
  }

  if (!hasHours) {
    items.push({
      key: 'hours',
      tone: 'warning',
      title: 'Orari mancanti',
      description: isOwner
        ? 'Imposta le giornate e gli orari di apertura: da lì nascono gli slot che il cliente può scegliere.'
        : 'Mancano finestre settimanali: solo l’owner può impostare orari e ferie.',
      ...(isOwner ? { ctaLabel: 'Imposta orari', onCta: props.onGoToHours } : {}),
      icon: 'setup',
    })
  }

  if (!hasContact || !hasLocation || !hasDescription) {
    items.push({
      key: 'profile',
      tone: 'info',
      title: 'Profilo incompleto',
      description: isOwner
        ? 'Telefono, indirizzo e una breve descrizione aiutano il cliente a capire chi sei e dove sei.'
        : 'Profilo pubblico incompleto: solo l’owner può aggiornare contatti e scheda.',
      ...(isOwner ? { ctaLabel: 'Completa profilo', onCta: props.onGoToSettings } : {}),
      icon: 'info',
    })
  }

  if (items.length === 0) return null

  return (
    <div className="mt-6 space-y-3">
      <div className="tb-kicker">PRIORITÀ</div>
      <div className="grid grid-cols-1 gap-3">
        {items.slice(0, 4).map((it) => {
          const Icon = iconFor(it.icon)
          return (
            <div key={it.key} className={cn('rounded-2xl border px-5 py-4 transition-all', classesFor(it.tone))}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className={cn("mt-0.5 rounded-xl p-2.5", it.tone === 'danger' ? 'bg-red-500/10' : it.tone === 'warning' ? 'bg-amber-500/10' : 'bg-[#4F7CFF]/10')}>
                    <Icon className={cn("h-5 w-5", iconColorFor(it.tone))} />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-wide">{it.title}</div>
                    <div className="mt-1 text-xs font-medium opacity-80 leading-relaxed">{it.description}</div>
                  </div>
                </div>
                {it.ctaLabel && it.onCta && (
                  <Button type="button" size="sm" variant="secondary" className="w-full sm:w-auto shrink-0 bg-white/5 border-white/10 hover:bg-white/10 text-white" onClick={it.onCta} rightIcon={<ArrowRight className="h-4 w-4" />}>
                    {it.ctaLabel}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
