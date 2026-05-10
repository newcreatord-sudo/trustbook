import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export default function Badge(props: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const { className, tone = 'neutral', ...rest } = props
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight shadow-sm',
        tone === 'neutral' && 'border-white/[0.1] bg-white/[0.055] text-white/82 shadow-black/20',
        tone === 'info' && 'border-[#4F7CFF]/40 bg-[#4F7CFF]/12 text-white shadow-[#4F7CFF]/14',
        tone === 'success' && 'border-emerald-500/35 bg-emerald-500/12 text-emerald-50 shadow-emerald-900/25',
        tone === 'warning' && 'border-amber-500/35 bg-amber-500/12 text-amber-50 shadow-amber-900/25',
        tone === 'danger' && 'border-red-500/35 bg-red-500/12 text-red-50 shadow-red-900/25',
        className,
      )}
    />
  )
}

