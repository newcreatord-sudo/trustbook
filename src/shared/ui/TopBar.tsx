import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function TopBar(props: { title?: string; subtitle?: string; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', props.className)}>
      <div>
        {props.title ? <div className="tb-title">{props.title}</div> : null}
        {props.subtitle ? <div className="tb-subtitle mt-1">{props.subtitle}</div> : null}
      </div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  )
}

