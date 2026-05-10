import { cn } from '@/lib/utils'
import MediaThumb from '@/shared/ui/MediaThumb'

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

  const sizeCls =
    size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-sm' : 'h-10 w-10 text-xs'

  if (props.src?.trim()) {
    return (
      <MediaThumb
        src={props.src}
        alt={props.name ?? 'Avatar'}
        fallbackLabel={props.name ?? undefined}
        fallbackContent={initials || 'TB'}
        zoom={false}
        roundedClassName="!rounded-2xl"
        containerClassName={cn(sizeCls, 'font-semibold', props.className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'tb-photo-frame inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.09] to-white/[0.03] font-semibold text-white/85 shadow-xl shadow-black/50 ring-2 ring-white/15',
        sizeCls,
        props.className,
      )}
    >
      {initials || 'TB'}
    </div>
  )
}
