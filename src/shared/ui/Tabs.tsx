import { cn } from '@/lib/utils'

export type TabItem = { key: string; label: string; badge?: number; disabled?: boolean }

export default function Tabs(props: {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  className?: string
}) {
  return (
    <div role="tablist" className={cn('tb-seg', props.className)}>
      {props.items.map((it) => {
        const active = it.key === props.value
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={Boolean(it.disabled)}
            onClick={() => props.onChange(it.key)}
            className={cn(
              'tb-seg-btn',
              active ? 'tb-seg-btn-active' : 'tb-seg-btn-inactive',
              it.disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {it.label}
              {typeof it.badge === 'number' && it.badge > 0 ? (
                <span className="inline-flex min-w-[22px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/80">
                  {Math.min(99, it.badge)}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
