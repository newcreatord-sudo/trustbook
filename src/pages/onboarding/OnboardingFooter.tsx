import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { onboardingSteps } from '@/pages/onboarding/constants'

export default function OnboardingFooter(props: {
  idx: number
  saving: boolean
  canNext: boolean
  onBack: () => void
  onNext: () => void
}) {
  const last = props.idx === onboardingSteps.length - 1
  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={props.onBack}
        disabled={props.idx === 0 || props.saving}
        className={cn(
          'inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition',
          props.idx === 0 || props.saving
            ? 'border-white/10 bg-white/5 text-white/40'
            : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10',
        )}
      >
        <ChevronLeft className="h-4 w-4" />
        Indietro
      </button>

      {!last ? (
        <button
          type="button"
          onClick={props.onNext}
          disabled={!props.canNext || props.saving}
          className={cn(
            'inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition',
            !props.canNext || props.saving ? 'bg-white/10 text-white/40' : 'bg-[#4F7CFF] text-white hover:bg-[#6A90FF]',
          )}
        >
          Avanti
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : (
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-white/70">
          <CheckCircle2 className="h-4 w-4" />
          Pronto a creare
        </div>
      )}
    </div>
  )
}
