import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type AlertTone = 'info' | 'danger' | 'success' | 'warning'

export default function Alert(props: HTMLAttributes<HTMLDivElement> & { tone?: AlertTone }) {
  const { className, tone = 'info', ...rest } = props
  return (
    <div
      {...rest}
      className={cn(
        'tb-alert',
        tone === 'info' && 'tb-alert-info',
        tone === 'danger' && 'tb-alert-danger',
        tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-50',
        className,
      )}
    />
  )
}

