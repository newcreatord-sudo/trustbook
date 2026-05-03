import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BusinessOnboardingErrors, BusinessOnboardingForm } from '@/pages/onboarding/BusinessOnboarding'

export default function LocationMediaStep(props: {
  value: BusinessOnboardingForm
  onChange: (next: BusinessOnboardingForm) => void
  onError: (msg: string | null) => void
  errors?: BusinessOnboardingErrors
}) {
  const v = props.value
  const e = props.errors
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-white/60">Latitudine</label>
        <input
          value={v.lat}
          onChange={(e) => props.onChange({ ...v, lat: e.target.value })}
          inputMode="decimal"
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.lat ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.lat && <div className="mt-1 text-xs text-red-100">{e.lat}</div>}
      </div>
      <div>
        <label className="text-xs font-semibold text-white/60">Longitudine</label>
        <input
          value={v.lng}
          onChange={(e) => props.onChange({ ...v, lng: e.target.value })}
          inputMode="decimal"
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.lng ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.lng && <div className="mt-1 text-xs text-red-100">{e.lng}</div>}
      </div>
      <button
        type="button"
        onClick={() => {
          props.onError(null)
          if (!('geolocation' in navigator)) return props.onError('Geolocalizzazione non supportata dal browser.')
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              props.onChange({ ...v, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) })
            },
            () => props.onError('Permesso posizione negato o non disponibile.'),
            { enableHighAccuracy: true, timeout: 8000 },
          )
        }}
        className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
      >
        <MapPin className="h-4 w-4" />
        Usa la mia posizione
      </button>
      <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
        Suggerimento: usa "Usa la mia posizione" per evitare errori. Latitudine valida: -90..90, longitudine: -180..180.
      </div>
      <div className="md:col-span-2">
        <label className="text-xs font-semibold text-white/60">Logo (URL)</label>
        <input
          value={v.logoUrl}
          onChange={(e) => props.onChange({ ...v, logoUrl: e.target.value })}
          placeholder="https://..."
          className={cn(
            'mt-1 w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.logoUrl ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.logoUrl && <div className="mt-1 text-xs text-red-100">{e.logoUrl}</div>}
        {v.logoUrl.trim() && (
          <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3">
            <img src={v.logoUrl.trim()} alt="Logo" className="h-16 w-16 rounded-xl object-cover" />
          </div>
        )}
      </div>
      <div className="md:col-span-2">
        <label className="text-xs font-semibold text-white/60">Galleria (1 URL per riga)</label>
        <textarea
          value={v.galleryText}
          onChange={(e) => props.onChange({ ...v, galleryText: e.target.value })}
          rows={4}
          placeholder="https://...\nhttps://..."
          className={cn(
            'mt-1 w-full resize-none rounded-xl border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60',
            e?.galleryText ? 'border-red-500/40' : 'border-white/10',
          )}
        />
        {e?.galleryText && <div className="mt-1 text-xs text-red-100">{e.galleryText}</div>}
        {v.galleryText.trim() && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {v.galleryText
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 8)
              .map((url) => (
                <div key={url} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <img src={url} alt="Foto" className="h-24 w-full object-cover" />
                </div>
              ))}
          </div>
        )}
      </div>
      <div className={cn('md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/60', !v.logoUrl.trim() && !v.galleryText.trim() && 'opacity-80')}>
        Puoi lasciare vuoto e aggiungere media più tardi.
      </div>
    </div>
  )
}
