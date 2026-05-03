import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function ListItem(props: {
  title: string
  subtitle?: string
  left?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors duration-150 ease-out',
        props.className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {props.left ? <div className="mt-0.5">{props.left}</div> : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{props.title}</div>
          {props.subtitle ? <div className="mt-1 line-clamp-2 text-xs text-white/60">{props.subtitle}</div> : null}
        </div>
      </div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  )
}
