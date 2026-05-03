import type { BusinessOnboardingErrors, BusinessOnboardingForm } from '@/pages/onboarding/BusinessOnboarding'

export default function DepositStep(props: {
  value: BusinessOnboardingForm
  onChange: (next: BusinessOnboardingForm) => void
  errors?: BusinessOnboardingErrors
}) {
  const v = props.value
  const e = props.errors
  const asDepositMode = (value: string): BusinessOnboardingForm['depositMode'] => {
    if (value === 'none' || value === 'everyone' || value === 'risk_based' || value === 'dynamic') return value
    return 'none'
  }
  const asDepositValueType = (value: string): BusinessOnboardingForm['depositValueType'] => {
    return value === 'fixed_amount' ? 'fixed_amount' : 'percentage'
  }
  const asRefundPolicy = (value: string): BusinessOnboardingForm['refundPolicy'] => {
    if (value === 'moderate' || value === 'strict' || value === 'non_refundable') return value
    return 'flexible'
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-[#4F7CFF]/20 bg-[#4F7CFF]/5 p-4">
        <div className="text-sm font-semibold text-[#4F7CFF]">Politica Caparra (Motore Anti-No-Show)</div>
        <div className="mt-1 text-xs text-[#4F7CFF]/70">
          La caparra aiuta a ridurre i no-show ed è presentata al cliente come una &quot;protezione agenda&quot;.
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-white/60">Modalità Caparra</label>
        <select
          value={v.depositMode}
          onChange={(evt) => props.onChange({ ...v, depositMode: asDepositMode(evt.target.value) })}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
        >
          <option value="none">Nessuna caparra</option>
          <option value="everyone">Caparra per tutti</option>
          <option value="risk_based">Solo clienti a rischio</option>
          <option value="dynamic">Dinamica (varia in base al rischio)</option>
        </select>
        {e?.depositMode && <div className="mt-1 text-xs text-red-100">{e.depositMode}</div>}
      </div>

      {v.depositMode !== 'none' && v.depositMode !== 'dynamic' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-white/60">Tipo Valore</label>
            <select
              value={v.depositValueType}
              onChange={(evt) => props.onChange({ ...v, depositValueType: asDepositValueType(evt.target.value) })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
            >
              <option value="percentage">Percentuale (%)</option>
              <option value="fixed_amount">Fissa (€)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-white/60">
              {v.depositValueType === 'percentage' ? 'Percentuale' : 'Importo (€)'}
            </label>
            <input
              type="number"
              value={v.depositValueType === 'percentage' ? v.depositPercent : v.depositFixedCents}
              onChange={(e) =>
                v.depositValueType === 'percentage'
                  ? props.onChange({ ...v, depositPercent: e.target.value })
                  : props.onChange({ ...v, depositFixedCents: e.target.value })
              }
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
            />
            {v.depositValueType === 'percentage' && e?.depositPercent && (
              <div className="mt-1 text-xs text-red-100">{e.depositPercent}</div>
            )}
            {v.depositValueType === 'fixed_amount' && e?.depositFixedCents && (
              <div className="mt-1 text-xs text-red-100">{e.depositFixedCents}</div>
            )}
          </div>
        </div>
      )}

      {v.depositMode === 'dynamic' && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs font-semibold text-white/60">Regole Dinamiche</div>
          
          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="text-sm text-emerald-400">Verde</div>
            <select
              value={v.depositGreenType}
              onChange={(evt) => props.onChange({ ...v, depositGreenType: asDepositValueType(evt.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            >
              <option value="percentage">%</option>
              <option value="fixed_amount">€</option>
            </select>
            <input
              type="number"
              value={v.depositGreenValue}
              onChange={(e) => props.onChange({ ...v, depositGreenValue: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="text-sm text-yellow-400">Giallo</div>
            <select
              value={v.depositYellowType}
              onChange={(evt) => props.onChange({ ...v, depositYellowType: asDepositValueType(evt.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            >
              <option value="percentage">%</option>
              <option value="fixed_amount">€</option>
            </select>
            <input
              type="number"
              value={v.depositYellowValue}
              onChange={(e) => props.onChange({ ...v, depositYellowValue: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="text-sm text-red-400">Rosso</div>
            <select
              value={v.depositRedType}
              onChange={(evt) => props.onChange({ ...v, depositRedType: asDepositValueType(evt.target.value) })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            >
              <option value="percentage">%</option>
              <option value="fixed_amount">€</option>
            </select>
            <input
              type="number"
              value={v.depositRedValue}
              onChange={(e) => props.onChange({ ...v, depositRedValue: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            />
          </div>
        </div>
      )}

      <div className="space-y-3 pt-2">
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={v.manualApprovalForHighRisk}
            onChange={(e) => props.onChange({ ...v, manualApprovalForHighRisk: e.target.checked })}
            className="h-4 w-4 rounded border-white/10 bg-white/5 text-[#4F7CFF]"
          />
          Richiedi approvazione manuale per clienti ad alto rischio
        </label>

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={v.depositRetainedOnNoShow}
            onChange={(e) => props.onChange({ ...v, depositRetainedOnNoShow: e.target.checked })}
            className="h-4 w-4 rounded border-white/10 bg-white/5 text-[#4F7CFF]"
          />
          Trattieni caparra in caso di no-show
        </label>

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={v.depositRetainedOnLateCancel}
            onChange={(e) => props.onChange({ ...v, depositRetainedOnLateCancel: e.target.checked })}
            className="h-4 w-4 rounded border-white/10 bg-white/5 text-[#4F7CFF]"
          />
          Trattieni caparra per cancellazione tardiva
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <div>
          <label className="text-xs font-semibold text-white/60">Politica di Rimborso</label>
          <select
            value={v.refundPolicy}
            onChange={(evt) => props.onChange({ ...v, refundPolicy: asRefundPolicy(evt.target.value) })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
          >
            <option value="flexible">Flessibile</option>
            <option value="moderate">Moderata</option>
            <option value="strict">Rigorosa</option>
            <option value="non_refundable">Non rimborsabile</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-white/60">Cancellazione Gratuita (Ore)</label>
          <input
            type="number"
            value={v.cancellationFreeUntilHours}
            onChange={(e) => props.onChange({ ...v, cancellationFreeUntilHours: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
          />
        </div>
      </div>
    </div>
  )
}
