import { useMemo } from 'react'
import type { BusinessOnboardingForm } from '@/pages/onboarding/BusinessOnboarding'
import { formatMoneyEUR } from '@/utils/time'
import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'
import { CheckCircle2, Clock, CalendarDays, Users } from 'lucide-react'

export default function ReviewStep(props: {
  value: BusinessOnboardingForm
  saving: boolean
  canCreate: boolean
  disabledReason?: string | null
  onCreate: () => Promise<void>
}) {
  const v = props.value
  const depositSummary = useMemo(() => {
    if (v.depositMode === 'none') return 'Nessuna'
    if (v.depositMode === 'dynamic') return 'Dinamica'
    
    const rule =
      v.depositMode === 'everyone'
        ? 'Sempre'
        : v.depositMode === 'risk_based'
          ? `Solo rischio`
          : 'Off'
    const amount =
      v.depositValueType === 'fixed_amount'
        ? formatMoneyEUR(Math.max(0, Math.floor(Number(v.depositFixedCents) || 0)))
        : `${v.depositPercent}%`
    return `${rule} · ${amount}`
  }, [v])

  const daysCount = Object.keys(v.schedule).length

  return (
    <div className="space-y-6">
      <div className="text-sm font-medium text-white/70">
        Controlla il riepilogo prima di creare la tua attività. Potrai sempre modificare questi dati dalla tua Dashboard.
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card padded className="border-white/10 bg-white/5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50 mb-3">
            <CheckCircle2 className="h-4 w-4 text-[#4F7CFF]" />
            Dati base
          </div>
          <div className="text-lg font-bold text-white">{v.name.trim() || '—'}</div>
          <div className="text-sm font-medium text-white/60">{v.category}</div>
          <div className="mt-2 text-sm text-white/80">{v.city.trim() ? v.city.trim() : '—'}</div>
        </Card>

        <Card padded className="border-white/10 bg-white/5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50 mb-3">
            <CheckCircle2 className="h-4 w-4 text-amber-400" />
            Regole & Caparra
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-white/60">Approvazione</span>
              <span className="font-medium text-white">{v.approvalMode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Cancellazione</span>
              <span className="font-medium text-white">{v.cancellationWindowMin} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Caparra</span>
              <span className="font-medium text-white">{depositSummary}</span>
            </div>
          </div>
        </Card>

        <Card padded className="border-white/10 bg-white/5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50 mb-3">
            <Clock className="h-4 w-4 text-emerald-400" />
            Servizi ({v.services.length})
          </div>
          <div className="space-y-2">
            {v.services.slice(0, 3).map((s, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-white/80">{s.name || 'Servizio senza nome'}</span>
                <span className="text-white/60">{s.durationMin} min</span>
              </div>
            ))}
            {v.services.length > 3 && (
              <div className="text-xs text-white/40 italic">...e altri {v.services.length - 3}</div>
            )}
          </div>
        </Card>

        <Card padded className="border-white/10 bg-white/5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50 mb-3">
            <CalendarDays className="h-4 w-4 text-purple-400" />
            Orari
          </div>
          <div className="text-sm font-medium text-white/80">
            Aperto {daysCount} {daysCount === 1 ? 'giorno' : 'giorni'} a settimana.
          </div>
          {v.staffEmails.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-white/60 border-t border-white/10 pt-3">
              <Users className="h-4 w-4" />
              {v.staffEmails.length} membri staff invitati
            </div>
          )}
        </Card>
      </div>

      <Button
        type="button"
        disabled={props.saving || !props.canCreate}
        onClick={() => void props.onCreate()}
        className="w-full py-3.5 text-base font-bold shadow-lg shadow-[#4F7CFF]/20"
      >
        {props.saving ? 'Creazione in corso…' : 'Crea attività e vai alla dashboard'}
      </Button>

      {!props.saving && !props.canCreate && props.disabledReason && (
        <div className="text-center text-xs font-medium text-white/60">{props.disabledReason}</div>
      )}

      <div className="text-center text-xs text-white/50">
        Dopo la creazione potrai gestire tutti i dettagli operativi e monitorare l'andamento dalla tua nuova dashboard.
      </div>
    </div>
  )
}
