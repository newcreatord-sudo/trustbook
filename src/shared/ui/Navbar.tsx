import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function Navbar(props: { children: ReactNode; className?: string }) {
  return <div className={cn('tb-card flex items-center justify-between gap-3 px-4 py-3', props.className)}>{props.children}</div>
}

