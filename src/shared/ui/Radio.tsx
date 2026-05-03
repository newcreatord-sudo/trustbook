import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export default function Radio(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; description?: string },
) {
  const { className, label, description, checked, ...rest } = props
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3', className)}>
      <span
        className={cn(
          'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border transition',
          checked ? 'border-[#4F7CFF]/60 bg-[#4F7CFF]/10' : 'border-white/15 bg-white/5',
        )}
      >
        <span className={cn('h-2.5 w-2.5 rounded-full', checked ? 'bg-[#4F7CFF]' : 'bg-transparent')} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-white/70">{description}</span> : null}
      </span>
      <input {...rest} checked={checked} type="radio" className="sr-only" />
    </label>
  )
}

