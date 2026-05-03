import { cn } from '@/lib/utils'
import type { BusinessOnboardingErrors, BusinessOnboardingForm } from '@/pages/onboarding/BusinessOnboarding'

export default function ContactsStep(props: {
  value: BusinessOnboardingForm
  onChange: (next: BusinessOnboardingForm) => void
  errors?: BusinessOnboardingErrors
}) {
  const v = props.value
  const e = props.errors
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-white/60">Telefono</label>
        <input
          value={v.phone}
          onChange={(e) => props.onChange({ ...v, phone: e.target.value })}
          placeholder="+39..."
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.phone ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.phone && <div className="mt-1 text-xs text-red-100">{e.phone}</div>}
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">Email</label>
        <input
          value={v.email}
          onChange={(e) => props.onChange({ ...v, email: e.target.value })}
          placeholder="info@..."
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.email ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.email && <div className="mt-1 text-xs text-red-100">{e.email}</div>}
      </div>
      <div className="md:col-span-2">
        <label className="text-xs font-semibold text-white/60">Indirizzo</label>
        <input
          value={v.addressText}
          onChange={(e) => props.onChange({ ...v, addressText: e.target.value })}
          placeholder="Via..., numero"
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.addressText ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.addressText && <div className="mt-1 text-xs text-red-100">{e.addressText}</div>}
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">Città</label>
        <input
          value={v.city}
          onChange={(e) => props.onChange({ ...v, city: e.target.value })}
          placeholder="Milano"
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.city ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.city && <div className="mt-1 text-xs text-red-100">{e.city}</div>}
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">CAP</label>
        <input
          value={v.postalCode}
          onChange={(e) => props.onChange({ ...v, postalCode: e.target.value })}
          placeholder="20100"
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.postalCode ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.postalCode && <div className="mt-1 text-xs text-red-100">{e.postalCode}</div>}
      </div>
      <div className="md:col-span-2">
        <label className="text-xs font-semibold text-white/60">Sito (opzionale)</label>
        <input
          value={v.website}
          onChange={(e) => props.onChange({ ...v, website: e.target.value })}
          placeholder="https://..."
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.website ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.website && <div className="mt-1 text-xs text-red-100">{e.website}</div>}
      </div>
    </div>
  )
}
