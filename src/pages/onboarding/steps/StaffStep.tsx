import { Plus, Trash2 } from 'lucide-react'
import type { BusinessOnboardingForm, BusinessOnboardingErrors } from '@/pages/onboarding/BusinessOnboarding'
import Input from '@/shared/ui/Input'
import Button from '@/shared/ui/Button'

export default function StaffStep(props: {
  value: BusinessOnboardingForm
  onChange: (v: BusinessOnboardingForm) => void
  errors?: BusinessOnboardingErrors
}) {
  const { value, onChange, errors } = props

  const addEmail = () => {
    onChange({
      ...value,
      staffEmails: [...value.staffEmails, ''],
    })
  }

  const updateEmail = (index: number, val: string) => {
    const updated = [...value.staffEmails]
    updated[index] = val
    onChange({ ...value, staffEmails: updated })
  }

  const removeEmail = (index: number) => {
    const updated = value.staffEmails.filter((_, i) => i !== index)
    onChange({ ...value, staffEmails: updated })
  }

  return (
    <div className="space-y-6">
      <div className="text-sm font-medium text-white/70 leading-relaxed">
        Vuoi invitare collaboratori? Aggiungi le loro email. 
        <br />
        <span className="text-white/50 text-xs italic">Nota: devono avere già un account TrustBook come utente. Potrai sempre farlo in seguito dalla Dashboard.</span>
      </div>

      {errors?.staffEmails && <div className="text-sm font-medium text-red-400">{errors.staffEmails}</div>}

      <div className="space-y-4">
        {value.staffEmails.map((email, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors focus-within:border-[#4F7CFF]/50">
            <Input
              value={email}
              onChange={(e) => updateEmail(i, e.target.value)}
              placeholder="es. collaboratore@email.it"
              className="flex-1 border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={() => removeEmail(i)}
              className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/10 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {value.staffEmails.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/20 p-8 text-center">
            <p className="text-sm font-medium text-white/50">Nessun membro inserito (opzionale).</p>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={addEmail}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        Aggiungi email
      </Button>
    </div>
  )
}
