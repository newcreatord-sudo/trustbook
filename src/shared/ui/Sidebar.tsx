import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function Sidebar(props: { header?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <aside className={cn('tb-card h-full w-full p-3', props.className)}>
      {props.header ? <div className="px-2 pb-3">{props.header}</div> : null}
      <nav className="space-y-2">{props.children}</nav>
    </aside>
  )
}

