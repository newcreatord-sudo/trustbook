import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { sanitizePublicHttpUrl } from '@/lib/publicImageUrl'
import { cn } from '@/lib/utils'

function imageSrcWithRetryParam(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('tb_retry', '1')
    return u.href
  } catch {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}tb_retry=1`
  }
}

type LoadPhase = 'initial' | 'retry' | 'failed'

function loadPhaseReducer(state: LoadPhase, action: 'fail' | 'reset'): LoadPhase {
  if (action === 'reset') return 'initial'
  if (state === 'initial') return 'retry'
  return 'failed'
}

/**
 * Anteprima logo/foto con cornice TrustBook e fallback reale se URL assente o immagine non caricabile.
 */
export default function MediaThumb(props: {
  src?: string | null
  alt: string
  /** Per lettera nel placeholder (se non usi fallbackContent) */
  fallbackLabel?: string
  /** Sostituisce la singola lettera (es. iniziali avatar) */
  fallbackContent?: ReactNode
  containerClassName?: string
  placeholderClassName?: string
  zoom?: boolean
  roundedClassName?: string
  /** Per riempire un contenitore `relative` (es. gallery aspect-square) */
  fill?: boolean
  hoverScale?: boolean
  interactiveLift?: boolean
}) {
  const {
    src,
    alt,
    fallbackLabel,
    fallbackContent,
    containerClassName,
    placeholderClassName,
    zoom = true,
    roundedClassName,
    fill = false,
    hoverScale = false,
    interactiveLift = false,
  } = props

  const safeSrc = useMemo(() => sanitizePublicHttpUrl(typeof src === 'string' ? src : '') ?? '', [src])

  const [phase, dispatchPhase] = useReducer(loadPhaseReducer, 'initial')

  useEffect(() => {
    dispatchPhase('reset')
  }, [safeSrc])

  const displaySrc = useMemo(() => {
    if (!safeSrc || phase === 'failed') return null
    return phase === 'initial' ? safeSrc : imageSrcWithRetryParam(safeSrc)
  }, [safeSrc, phase])

  const onError = useCallback(() => {
    dispatchPhase('fail')
  }, [])

  const label = (fallbackLabel ?? alt).trim()
  const letter = (label.charAt(0) || '?').toUpperCase()

  const lift = interactiveLift && 'transition-transform duration-300 motion-safe:group-hover:-translate-y-0.5'

  const placeholderShell = cn(
    'flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#4F7CFF]/35 via-white/12 to-indigo-600/20 font-bold text-white shadow-xl shadow-black/45 ring-2 ring-white/18',
    roundedClassName ?? 'rounded-2xl',
    lift,
    containerClassName,
    placeholderClassName,
  )

  if (!displaySrc) {
    return (
      <div className={placeholderShell} role="img" aria-label={alt}>
        {fallbackContent ?? letter}
      </div>
    )
  }

  const frameShell = cn(
    'tb-photo-frame shrink-0 overflow-hidden',
    zoom && 'tb-photo-frame-zoom',
    roundedClassName,
    fill && 'relative h-full min-h-0 w-full',
    lift,
    containerClassName,
  )

  return (
    <div className={frameShell}>
      <img
        key={displaySrc}
        src={displaySrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={onError}
        className={cn(
          'h-full w-full object-cover',
          fill && 'absolute inset-0 min-h-full min-w-full',
          hoverScale && 'motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-[1.06]',
        )}
      />
    </div>
  )
}
