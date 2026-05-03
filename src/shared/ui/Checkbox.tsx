import type { InputHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Checkbox(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; description?: string },
) {
  const { className, label, description, checked, ...rest } = props

  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3', className)}>
      <span
        className={cn(
          'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border transition',
          checked ? 'border-[#4F7CFF]/60 bg-[#4F7CFF]/20 text-white' : 'border-white/15 bg-white/5 text-white/0',
        )}
      >
        <Check className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-white/70">{description}</span> : null}
      </span>
      <input {...rest} checked={checked} type="checkbox" className="sr-only" />
    </label>
  )
}

