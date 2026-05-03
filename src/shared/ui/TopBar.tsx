import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function TopBar(props: { title?: string; subtitle?: string; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', props.className)}>
      <div>
        {props.title ? <div className="text-sm font-semibold text-white">{props.title}</div> : null}
        {props.subtitle ? <div className="mt-1 text-xs text-white/70">{props.subtitle}</div> : null}
      </div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  )
}

