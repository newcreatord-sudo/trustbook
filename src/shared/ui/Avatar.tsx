import { cn } from '@/lib/utils'

export default function Avatar(props: {
  name?: string | null
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const size = props.size ?? 'md'
  const initials = (props.name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
    .slice(0, 2)

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-xs font-semibold text-white/80',
        size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14 text-sm' : 'h-10 w-10',
        props.className,
      )}
    >
      {props.src ? <img src={props.src} alt={props.name ?? 'Avatar'} className="h-full w-full object-cover" /> : initials || 'TB'}
    </div>
  )
}
