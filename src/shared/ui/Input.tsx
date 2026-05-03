import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export default function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return <input {...rest} className={cn('tb-input', className)} />
}

