import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md'

export default function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ButtonSize
    leftIcon?: ReactNode
    rightIcon?: ReactNode
    /** Mostra spinner e blocca click — UX coerente per azioni async ovunque nell’app. */
    loading?: boolean
  },
) {
  const {
    className,
    variant = 'primary',
    size = 'md',
    leftIcon,
    rightIcon,
    children,
    loading = false,
    disabled,
    ...rest
  } = props

  const isBusy = Boolean(loading)
  const isDisabled = Boolean(disabled) || isBusy

  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={isBusy || undefined}
      aria-disabled={isDisabled || undefined}
      className={cn(
        'tb-btn motion-safe:transition-[transform,box-shadow,opacity] motion-safe:duration-200',
        size === 'sm' ? 'min-h-[38px] rounded-xl px-3 py-2 text-xs' : 'min-h-[44px] rounded-2xl px-4 py-3 text-sm',
        variant === 'primary' && 'tb-btn-primary shadow-lg shadow-[#4F7CFF]/20 hover:shadow-[#4F7CFF]/40',
        variant === 'secondary' && 'tb-btn-secondary hover:bg-white/10',
        variant === 'ghost' && 'text-white/80 hover:bg-white/10',
        variant === 'danger' && 'border border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/15 shadow-lg shadow-red-500/10',
        variant === 'success' && 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/15 shadow-lg shadow-emerald-500/10',
        isBusy && 'pointer-events-none',
        className,
      )}
    >
      {isBusy ? (
        <Loader2
          className={cn('shrink-0 opacity-90 motion-safe:animate-spin', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')}
          aria-hidden
        />
      ) : leftIcon ? (
        <span className="-ml-0.5 inline-flex shrink-0 items-center">{leftIcon}</span>
      ) : null}
      <span className={cn('inline-flex items-center gap-1', isBusy && 'opacity-95')}>{children}</span>
      {!isBusy && rightIcon ? <span className="-mr-0.5 inline-flex shrink-0 items-center">{rightIcon}</span> : null}
    </button>
  )
}
