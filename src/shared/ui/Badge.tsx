import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export default function Badge(props: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const { className, tone = 'neutral', ...rest } = props
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        tone === 'neutral' && 'border-white/10 bg-white/5 text-white/80',
        tone === 'info' && 'border-[#4F7CFF]/35 bg-[#4F7CFF]/10 text-white',
        tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-50',
        tone === 'danger' && 'border-red-500/30 bg-red-500/10 text-red-100',
        className,
      )}
    />
  )
}

