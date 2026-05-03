import { useEffect, useMemo, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { BookingEventRow } from '@/domain/supabase'
import { errorMessage } from '@/lib/errors'
import { bookingEventToUi } from '@/utils/bookingEventsUi'

export default function BookingTimeline(props: {
  bookingId: string
  busy?: boolean
}) {
  const [rows, setRows] = useState<BookingEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('booking_events')
          .select('*')
          .eq('booking_id', props.bookingId)
          .order('created_at', { ascending: false })
          .limit(30)
        if (!mounted) return
        if (error) throw error
        setRows((data as BookingEventRow[]) ?? [])
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento timeline.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [props.bookingId])

  const ui = useMemo(() => rows.map((r) => ({ id: r.id, ...bookingEventToUi(r) })), [rows])

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/5 p-4 transition-opacity',
        props.busy && 'pointer-events-none opacity-50',
      )}
    >
      <div>
        <div className="text-xs font-semibold tracking-wide text-white/60">TIMELINE</div>
        <div className="mt-1 text-[11px] text-white/60">Cosa è successo, in ordine temporale.</div>
      </div>

      {error && (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
          {error}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="text-xs text-white/60">Caricamento…</div>
        ) : ui.length === 0 ? (
          <div className="text-xs text-white/60">Nessun evento.</div>
        ) : (
          ui.map((e) => (
            <div
              key={e.id}
              className={cn(
                'flex items-start justify-between gap-3 rounded-2xl border px-3 py-2',
                e.tone === 'good'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : e.tone === 'warn'
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : e.tone === 'bad'
                      ? 'border-red-500/20 bg-red-500/5'
                      : 'border-white/10 bg-white/5',
              )}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">{e.title}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/70">{e.description}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-[11px] text-white/50">
                <Clock3 className="h-3.5 w-3.5" />
                {e.when}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

