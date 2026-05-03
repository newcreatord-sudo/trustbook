import type { BusinessOnboardingForm, BusinessOnboardingErrors } from '@/pages/onboarding/BusinessOnboarding'
import { Plus, Trash2 } from 'lucide-react'
import Input from '@/shared/ui/Input'
import Button from '@/shared/ui/Button'
import { cn } from '@/lib/utils'

const DAYS = [
  { id: 1, label: 'Lunedì' },
  { id: 2, label: 'Martedì' },
  { id: 3, label: 'Mercoledì' },
  { id: 4, label: 'Giovedì' },
  { id: 5, label: 'Venerdì' },
  { id: 6, label: 'Sabato' },
  { id: 0, label: 'Domenica' },
]

export default function ScheduleStep(props: {
  value: BusinessOnboardingForm
  onChange: (v: BusinessOnboardingForm) => void
  errors?: BusinessOnboardingErrors
}) {
  const { value, onChange, errors } = props

  const toggleDay = (day: number) => {
    const newSchedule = { ...value.schedule }
    if (newSchedule[day]) {
      delete newSchedule[day]
    } else {
      newSchedule[day] = [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }]
    }
    onChange({ ...value, schedule: newSchedule })
  }

  const addRange = (day: number) => {
    const newSchedule = { ...value.schedule }
    newSchedule[day] = [...(newSchedule[day] || []), { start: '12:00', end: '14:00' }]
    onChange({ ...value, schedule: newSchedule })
  }

  const updateRange = (day: number, index: number, field: 'start' | 'end', val: string) => {
    const newSchedule = { ...value.schedule }
    const dayRanges = [...newSchedule[day]]
    dayRanges[index] = { ...dayRanges[index], [field]: val }
    newSchedule[day] = dayRanges
    onChange({ ...value, schedule: newSchedule })
  }

  const removeRange = (day: number, index: number) => {
    const newSchedule = { ...value.schedule }
    const dayRanges = newSchedule[day].filter((_, i) => i !== index)
    if (dayRanges.length === 0) {
      delete newSchedule[day]
    } else {
      newSchedule[day] = dayRanges
    }
    onChange({ ...value, schedule: newSchedule })
  }

  return (
    <div className="space-y-6">
      <div className="text-sm font-medium text-white/70">
        Configura i tuoi orari di apertura e di pausa. Puoi spezzare la giornata (es. mattina e pomeriggio) o usare l'orario continuato.
      </div>

      {errors?.schedule && <div className="text-sm font-medium text-red-400">{errors.schedule}</div>}

      <div className="space-y-3">
        {DAYS.map((d) => {
          const isOpen = Boolean(value.schedule[d.id])
          const ranges = value.schedule[d.id] || []

          return (
            <div
              key={d.id}
              className={cn(
                'rounded-2xl border p-4 transition-colors',
                isOpen ? 'border-[#4F7CFF]/30 bg-[#4F7CFF]/5' : 'border-white/5 bg-white/[0.02]'
              )}
            >
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-3">
                  <div
                    className={cn(
                      'flex h-5 w-10 items-center rounded-full p-1 transition-colors',
                      isOpen ? 'bg-[#4F7CFF]' : 'bg-white/20'
                    )}
                    onClick={() => toggleDay(d.id)}
                  >
                    <div
                      className={cn(
                        'h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                        isOpen ? 'translate-x-4.5' : 'translate-x-0'
                      )}
                    />
                  </div>
                  <span className={cn('text-sm font-bold', isOpen ? 'text-white' : 'text-white/50')}>{d.label}</span>
                </label>
              </div>

              {isOpen && (
                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  {ranges.map((r, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Input
                        type="time"
                        value={r.start}
                        onChange={(e) => updateRange(d.id, i, 'start', e.target.value)}
                        className="w-32 bg-black/20"
                      />
                      <span className="text-white/50">-</span>
                      <Input
                        type="time"
                        value={r.end}
                        onChange={(e) => updateRange(d.id, i, 'end', e.target.value)}
                        className="w-32 bg-black/20"
                      />
                      <button
                        type="button"
                        onClick={() => removeRange(d.id, i)}
                        className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/10 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus className="h-3 w-3" />}
                    onClick={() => addRange(d.id)}
                    className="mt-2 text-xs"
                  >
                    Aggiungi fascia
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
