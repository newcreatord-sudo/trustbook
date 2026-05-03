import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export default function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props
  return (
    <select {...rest} className={cn('tb-input', className)}>
      {children}
    </select>
  )
}

