import { useCallback, useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export type TabItem = { key: string; label: string; badge?: number; disabled?: boolean }

export default function Tabs(props: {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  className?: string
  /** Etichetta per lettori schermo sul gruppo di tab */
  ariaLabel?: string
}) {
  const { items, value, onChange, className, ariaLabel } = props

  const enabledIndices = useMemo(
    () => items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0),
    [items],
  )

  const focusNeighbor = useCallback(
    (fromIndex: number, delta: number) => {
      if (enabledIndices.length === 0) return
      const pos = enabledIndices.indexOf(fromIndex)
      const base = pos >= 0 ? pos : 0
      const next = (base + delta + enabledIndices.length) % enabledIndices.length
      const nextIndex = enabledIndices[next]
      const nextKey = items[nextIndex].key
      onChange(nextKey)
      requestAnimationFrame(() => {
        document.getElementById(`tb-tab-${nextKey}`)?.focus()
      })
    },
    [enabledIndices, items, onChange],
  )

  const onTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (items[index]?.disabled) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        focusNeighbor(index, 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        focusNeighbor(index, -1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        const first = enabledIndices[0]
        if (first !== undefined) {
          const k = items[first].key
          onChange(k)
          requestAnimationFrame(() => document.getElementById(`tb-tab-${k}`)?.focus())
        }
      } else if (e.key === 'End') {
        e.preventDefault()
        const last = enabledIndices[enabledIndices.length - 1]
        if (last !== undefined) {
          const k = items[last].key
          onChange(k)
          requestAnimationFrame(() => document.getElementById(`tb-tab-${k}`)?.focus())
        }
      }
    },
    [enabledIndices, focusNeighbor, items, onChange],
  )

  return (
    <div role="tablist" aria-label={ariaLabel} aria-orientation="horizontal" className={cn('tb-seg', className)}>
      {items.map((it, index) => {
        const active = it.key === value
        const tabId = `tb-tab-${it.key}`
        return (
          <button
            key={it.key}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={Boolean(it.disabled)}
            onClick={() => onChange(it.key)}
            onKeyDown={(e) => onTabKeyDown(e, index)}
            className={cn(
              'tb-seg-btn',
              active ? 'tb-seg-btn-active' : 'tb-seg-btn-inactive',
              it.disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {it.label}
              {typeof it.badge === 'number' && it.badge > 0 ? (
                <span className="inline-flex min-w-[22px] items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.08] px-2 py-0.5 text-[11px] font-semibold tracking-tight text-white/85 shadow-sm shadow-black/20">
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
