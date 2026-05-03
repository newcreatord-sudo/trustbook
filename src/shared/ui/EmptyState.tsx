import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function EmptyState(props: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center', props.className)}>
      {props.icon ? <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-[#4F7CFF] mb-3">{props.icon}</div> : null}
      <div className="text-base font-bold text-white">{props.title}</div>
      {props.description ? <div className="mt-2 text-sm text-white/60 max-w-sm mx-auto">{props.description}</div> : null}
      {props.action ? <div className="mt-6 flex justify-center">{props.action}</div> : null}
    </div>
  )
}

