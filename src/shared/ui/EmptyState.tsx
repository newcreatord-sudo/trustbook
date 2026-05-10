import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function EmptyState(props: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-dashed border-white/[0.12] bg-gradient-to-b from-white/[0.045] to-white/[0.02] p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        props.className,
      )}
    >
      {props.icon ? (
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F7CFF]/25 to-white/[0.04] text-[#8DACFF] ring-1 ring-white/[0.1] shadow-lg shadow-black/25">
          {props.icon}
        </div>
      ) : null}
      <div className="text-base font-semibold tracking-tight text-white">{props.title}</div>
      {props.description ? <div className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/70">{props.description}</div> : null}
      {props.action ? <div className="mt-7 flex justify-center">{props.action}</div> : null}
    </div>
  )
}

