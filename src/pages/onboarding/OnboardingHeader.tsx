import { CheckCircle2, RotateCcw, Save, Store } from 'lucide-react'
import { cn } from '@/lib/utils'
import { onboardingSteps } from '@/pages/onboarding/constants'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'

export default function OnboardingHeader(props: {
  idx: number
  maxEnabledIdx: number
  completed: boolean[]
  savedAt: number | null
  canSaveDraft: boolean
  draftState?: 'idle' | 'saving' | 'saved' | 'error'
  draftError?: string | null
  onSaveDraft: () => void
  onJump: (idx: number) => void
  onReset: () => void
}) {
  const savedLabel = (() => {
    if (props.draftState === 'saving') return 'Salvataggio…'
    if (props.draftState === 'error') return props.draftError ? `Errore: ${props.draftError}` : 'Errore salvataggio'
    if (!props.savedAt) return null
    const diff = Date.now() - props.savedAt
    if (diff < 10_000) return 'Salvato ora'
    if (diff < 60_000) return 'Salvato 1 min fa'
    const m = Math.round(diff / 60_000)
    return `Salvato ${m} min fa`
  })()

  return (
    <Card className="p-5" padded={false}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#4F7CFF]">
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Onboarding attività</div>
            <div className="mt-1 text-xs text-white/70">Setup in pochi step, con salvataggio automatico.</div>
            {savedLabel && <div className="mt-1 text-[11px] text-white/60">{savedLabel}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-white/60">STEP</div>
          <div className="text-sm font-semibold text-white">
            {props.idx + 1}/{onboardingSteps.length}
          </div>
          <div className="mt-2 flex flex-col items-end gap-2">
            <Button
              type="button"
              onClick={props.onSaveDraft}
              disabled={!props.canSaveDraft || props.draftState === 'saving'}
              variant="secondary"
              size="sm"
              leftIcon={<Save className="h-3.5 w-3.5" />}
            >
              Salva bozza
            </Button>
            <Button
              type="button"
              onClick={props.onReset}
              variant="secondary"
              size="sm"
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
        <div
          className="h-full rounded-full bg-[#4F7CFF]/70"
          style={{ width: `${Math.round(((props.idx + 1) / onboardingSteps.length) * 100)}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
        {onboardingSteps.map((s, i) => {
          const allowed = i <= props.maxEnabledIdx
          const isActive = i === props.idx
          const isDone = Boolean(props.completed[i])
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => allowed && props.onJump(i)}
              disabled={!allowed}
              className={cn(
                'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition',
                isActive ? 'border-[#4F7CFF]/50 bg-[#4F7CFF]/10' : 'border-white/10 bg-white/5',
                allowed ? 'hover:bg-white/10' : 'cursor-not-allowed opacity-60',
              )}
            >
              <div>
                <div className="text-xs font-semibold text-white/70">{s.title}</div>
                <div className="mt-1 text-[11px] text-white/60">{s.subtitle}</div>
              </div>
              <div className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full border', isDone ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50' : 'border-white/10 bg-white/5 text-white/40')}>
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
