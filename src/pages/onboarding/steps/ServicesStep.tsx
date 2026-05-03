import { Plus, Trash2 } from 'lucide-react'
import type { BusinessOnboardingForm, BusinessOnboardingErrors } from '@/pages/onboarding/BusinessOnboarding'
import Input from '@/shared/ui/Input'
import Button from '@/shared/ui/Button'

export default function ServicesStep(props: {
  value: BusinessOnboardingForm
  onChange: (v: BusinessOnboardingForm) => void
  errors?: BusinessOnboardingErrors
}) {
  const { value, onChange, errors } = props

  const addService = () => {
    onChange({
      ...value,
      services: [...value.services, { name: '', durationMin: '45', priceCents: '' }],
    })
  }

  const updateService = (index: number, field: 'name' | 'durationMin' | 'priceCents', val: string) => {
    const updated = [...value.services]
    updated[index] = { ...updated[index], [field]: val }
    onChange({ ...value, services: updated })
  }

  const removeService = (index: number) => {
    const updated = value.services.filter((_, i) => i !== index)
    onChange({ ...value, services: updated })
  }

  return (
    <div className="space-y-6">
      <div className="text-sm font-medium text-white/70">
        Aggiungi i servizi principali che offri. Potrai modificarli o aggiungerne altri in seguito dalla dashboard.
      </div>

      {errors?.services && <div className="text-sm font-medium text-red-400">{errors.services}</div>}

      <div className="space-y-4">
        {value.services.map((svc, i) => (
          <div key={i} className="group relative rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-[#4F7CFF]/30 hover:bg-[#4F7CFF]/5">
            <div className="absolute right-4 top-4">
              <button
                type="button"
                onClick={() => removeService(i)}
                className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 pr-10">
              <div className="sm:col-span-6">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/60">
                  Nome servizio
                </label>
                <Input
                  value={svc.name}
                  onChange={(e) => updateService(i, 'name', e.target.value)}
                  placeholder="es. Taglio Uomo, Visita Specialistica..."
                  className="bg-black/20"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/60">
                  Durata (min)
                </label>
                <Input
                  type="number"
                  min="5"
                  step="5"
                  value={svc.durationMin}
                  onChange={(e) => updateService(i, 'durationMin', e.target.value)}
                  className="bg-black/20"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/60">
                  Prezzo (€) <span className="lowercase normal-case text-white/40">opz.</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={svc.priceCents}
                  onChange={(e) => updateService(i, 'priceCents', e.target.value)}
                  placeholder="es. 25.00"
                  className="bg-black/20"
                />
              </div>
            </div>
          </div>
        ))}

        {value.services.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/20 p-8 text-center">
            <p className="text-sm font-medium text-white/50">Nessun servizio inserito.</p>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={addService}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        Aggiungi servizio
      </Button>
    </div>
  )
}
