import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import type { BookingMessageRow } from '@/domain/supabase'
import { useAuth } from '@/providers/authContext'

export default function BookingChat(props: {
  bookingId: string
  businessId: string
}) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [messages, setMessages] = useState<BookingMessageRow[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const sendingLockRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const nearBottomRef = useRef(true)

  const canSend = useMemo(() => Boolean(userId && text.trim() && !sending), [sending, text, userId])

  const markRead = useCallback(async () => {
    if (!userId) return
    const { error } = await supabase
      .from('booking_chat_reads')
      .upsert({ booking_id: props.bookingId, user_id: userId, last_read_at: new Date().toISOString() })
    if (error) throw error
  }, [props.bookingId, userId])

  const sendMessage = useCallback(
    async (body: string) => {
      if (!userId) return
      const { data, error } = await supabase
        .from('booking_messages')
        .insert({
          booking_id: props.bookingId,
          sender_user_id: userId,
          body,
        })
        .select('*')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (data) {
        const row = data as BookingMessageRow
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev
          return [...prev, row]
        })
      }
      try {
        await markRead()
        window.dispatchEvent(new Event('tb:refresh-notifs'))
      } catch {
        void 0
      }
    },
    [markRead, props.bookingId, userId],
  )

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('booking_messages')
          .select('*')
          .eq('booking_id', props.bookingId)
          .order('created_at', { ascending: true })
        if (!mounted) return
        if (error) throw error
        setMessages((data as BookingMessageRow[]) ?? [])
        try {
          await markRead()
        } catch {
          void 0
        }
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore chat.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [markRead, props.bookingId])

  useEffect(() => {
    const last = messages[messages.length - 1]
    const mine = last ? last.sender_user_id === userId : false
    if (nearBottomRef.current || mine) {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
  }, [messages, userId])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`booking_messages:${props.bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_messages',
          filter: `booking_id=eq.${props.bookingId}`,
        },
        async (payload) => {
          const row = payload.new as BookingMessageRow
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, row]
          })
          if (nearBottomRef.current) {
            try {
              await markRead()
              window.dispatchEvent(new Event('tb:refresh-notifs'))
            } catch {
              void 0
            }
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [markRead, props.bookingId, userId])

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">Chat prenotazione</div>
        <div className="text-xs text-white/60">Booking: {props.bookingId.slice(0, 8)}</div>
      </div>

      {error && (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        className="mt-3 max-h-64 space-y-2 overflow-auto rounded-2xl border border-white/10 bg-black/20 p-3"
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          const threshold = 120
          const isNearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold
          nearBottomRef.current = isNearBottom
          if (isNearBottom) {
            void markRead()
              .then(() => {
                window.dispatchEvent(new Event('tb:refresh-notifs'))
              })
              .catch(() => void 0)
          }
        }}
      >
        {loading ? (
          <div className="text-sm text-white/70">Caricamento…</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-white/70">Nessun messaggio ancora.</div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_user_id === userId
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                    mine
                      ? 'bg-[#4F7CFF] text-white'
                      : 'border border-white/10 bg-white/5 text-white/90',
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={cn('mt-1 text-[11px]', mine ? 'text-white/70' : 'text-white/60')}>
                    {new Date(m.created_at).toLocaleString('it-IT')}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (!userId) return
            const body = text.trim()
            if (!body) return
            if (sendingLockRef.current) return
            sendingLockRef.current = true
            setError(null)
            setSending(true)
            setText('')
            nearBottomRef.current = true
            ;(async () => {
              try {
                await sendMessage(body)
              } catch (e2: unknown) {
                setError(errorMessage(e2, 'Errore invio messaggio.'))
                setText(body)
              } finally {
                sendingLockRef.current = false
                setSending(false)
              }
            })()
          }}
          placeholder="Scrivi un messaggio…"
          disabled={!userId || sending}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-[#4F7CFF]/60 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={() => {
            if (!userId) return
            const body = text.trim()
            if (!body) return
            if (sendingLockRef.current) return
            sendingLockRef.current = true
            setError(null)
            setSending(true)
            setText('')
            nearBottomRef.current = true

            ;(async () => {
              try {
                await sendMessage(body)
              } catch (e: unknown) {
                setError(errorMessage(e, 'Errore invio messaggio.'))
                setText(body)
              } finally {
                sendingLockRef.current = false
                setSending(false)
              }
            })()
          }}
          className={cn(
            'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition',
            !canSend ? 'bg-white/10 text-white/40' : 'bg-[#4F7CFF] text-white hover:bg-[#6A90FF]',
          )}
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
