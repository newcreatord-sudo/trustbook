import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md'

export default function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ButtonSize
    leftIcon?: ReactNode
    rightIcon?: ReactNode
  },
) {
  const { className, variant = 'primary', size = 'md', leftIcon, rightIcon, children, ...rest } = props

  return (
    <button
      {...rest}
      className={cn(
        'tb-btn active:scale-[0.98] transition-transform duration-200',
        size === 'sm' ? 'rounded-xl px-3 py-2 text-xs' : 'rounded-2xl px-4 py-3 text-sm',
        variant === 'primary' && 'tb-btn-primary shadow-lg shadow-[#4F7CFF]/20 hover:shadow-[#4F7CFF]/40',
        variant === 'secondary' && 'tb-btn-secondary hover:bg-white/10',
        variant === 'ghost' && 'text-white/80 hover:bg-white/10',
        variant === 'danger' && 'border border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/15 shadow-lg shadow-red-500/10',
        variant === 'success' && 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/15 shadow-lg shadow-emerald-500/10',
        className,
      )}
    >
      {leftIcon ? <span className="-ml-0.5 inline-flex items-center">{leftIcon}</span> : null}
      {children}
      {rightIcon ? <span className="-mr-0.5 inline-flex items-center">{rightIcon}</span> : null}
    </button>
  )
}
