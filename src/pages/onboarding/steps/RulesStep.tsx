import { cn } from '@/lib/utils'
import type { BusinessOnboardingErrors, BusinessOnboardingForm } from '@/pages/onboarding/BusinessOnboarding'

export default function RulesStep(props: {
  value: BusinessOnboardingForm
  onChange: (next: BusinessOnboardingForm) => void
  errors?: BusinessOnboardingErrors
}) {
  const v = props.value
  const e = props.errors
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-white/60">Approvazione</label>
        <select
          value={v.approvalMode}
          onChange={(e) => props.onChange({ ...v, approvalMode: e.target.value as 'auto' | 'manual' | 'risk_based' })}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
        >
          <option value="auto">Automatica</option>
          <option value="manual">Manuale</option>
          <option value="risk_based">In base al rischio</option>
        </select>
        <div className="mt-1 text-xs text-white/50">
          Automatica = conferma subito, Manuale = controlli tu, In base al rischio = automatica solo per clienti affidabili.
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">Min affidabilità (0–100)</label>
        <input
          value={v.requiredReliabilityMin}
          onChange={(e) => props.onChange({ ...v, requiredReliabilityMin: e.target.value })}
          inputMode="numeric"
          disabled={v.approvalMode !== 'risk_based'}
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.requiredReliabilityMin ? 'border-red-500/40' : 'border-white/10',
            v.approvalMode !== 'risk_based' && 'opacity-60',
          )}
        />
        {v.approvalMode !== 'risk_based' && (
          <div className="mt-1 text-xs text-white/50">Usata solo con approvazione "In base al rischio".</div>
        )}
        {e?.requiredReliabilityMin && <div className="mt-1 text-xs text-red-100">{e.requiredReliabilityMin}</div>}
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">Finestra cancellazione (min)</label>
        <input
          value={v.cancellationWindowMin}
          onChange={(e) => props.onChange({ ...v, cancellationWindowMin: e.target.value })}
          inputMode="numeric"
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.cancellationWindowMin ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.cancellationWindowMin && <div className="mt-1 text-xs text-red-100">{e.cancellationWindowMin}</div>}
        <div className="mt-1 text-xs text-white/50">Valori interi, massimo 7 giorni (10080 min).</div>
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">Buffer tra prenotazioni (min)</label>
        <input
          value={v.minGapMin}
          onChange={(e) => props.onChange({ ...v, minGapMin: e.target.value })}
          inputMode="numeric"
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.minGapMin ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.minGapMin && <div className="mt-1 text-xs text-red-100">{e.minGapMin}</div>}
        <div className="mt-1 text-xs text-white/50">Valori interi, massimo 180 min per evitare blocchi operativi.</div>
      </div>
      <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        Consigliato per iniziare: "In base al rischio", affidabilità minima 70, cancellazione 120 minuti prima.
      </div>
    </div>
  )
}
