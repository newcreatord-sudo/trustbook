import { cn } from '@/lib/utils'

export default function Switch(props: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={() => {
        if (props.disabled) return
        props.onChange(!props.checked)
      }}
      className={cn(
        'flex w-full items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition',
        props.disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-white/10',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{props.label}</span>
        {props.description ? <span className="mt-0.5 block text-xs text-white/60">{props.description}</span> : null}
      </span>
      <span
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-10 items-center rounded-full border transition',
          props.checked ? 'border-[#4F7CFF]/45 bg-[#4F7CFF]/25' : 'border-white/15 bg-white/5',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 translate-x-1 rounded-full bg-white transition',
            props.checked && 'translate-x-5 bg-white',
          )}
        />
      </span>
    </button>
  )
}
