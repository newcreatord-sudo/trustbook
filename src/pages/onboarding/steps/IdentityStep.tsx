import { cn } from '@/lib/utils'
import type { BusinessOnboardingErrors, BusinessOnboardingForm } from '@/pages/onboarding/BusinessOnboarding'
import { businessCategories } from '@/pages/onboarding/constants'

export default function IdentityStep(props: {
  value: BusinessOnboardingForm
  onChange: (next: BusinessOnboardingForm) => void
  errors?: BusinessOnboardingErrors
}) {
  const v = props.value
  const e = props.errors
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="text-xs font-semibold text-white/60">Nome attività</label>
        <input
          value={v.name}
          onChange={(e) => props.onChange({ ...v, name: e.target.value })}
          placeholder="Es. Barberia Centrale"
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.name ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.name && <div className="mt-1 text-xs text-red-100">{e.name}</div>}
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">Categoria</label>
        <select
          value={v.category}
          onChange={(e) => props.onChange({ ...v, category: e.target.value as (typeof businessCategories)[number] })}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
        >
          {businessCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">Stato</label>
        <button
          type="button"
          onClick={() => props.onChange({ ...v, isPaused: !v.isPaused })}
          className={cn(
            'mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold transition',
            v.isPaused
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-50 hover:bg-amber-500/15'
              : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10',
          )}
        >
          {v.isPaused ? 'In pausa (non prenotabile)' : 'Attiva'}
        </button>
      </div>
      <div className="md:col-span-2">
        <label className="text-xs font-semibold text-white/60">Descrizione (opzionale)</label>
        <textarea
          value={v.description}
          onChange={(e) => props.onChange({ ...v, description: e.target.value })}
          rows={4}
          placeholder="Due righe chiare: cosa fai e per chi."
          className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
        />
      </div>
    </div>
  )
}
