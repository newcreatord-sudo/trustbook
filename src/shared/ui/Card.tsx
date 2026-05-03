import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function Card(props: HTMLAttributes<HTMLDivElement> & { children: ReactNode; padded?: boolean }) {
  const { className, padded = true, ...rest } = props
  return <div {...rest} className={cn('tb-card', padded && 'tb-card-pad', className)} />
}

