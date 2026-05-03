import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export default function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props
  return <textarea {...rest} className={cn('tb-input min-h-[96px] resize-y', className)} />
}

