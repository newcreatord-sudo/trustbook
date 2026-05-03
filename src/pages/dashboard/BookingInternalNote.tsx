import { useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { BookingInternalNoteRow } from '@/domain/supabase'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/utils/time'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import Textarea from '@/shared/ui/Textarea'

export default function BookingInternalNote(props: {
  bookingId: string
  isOwner: boolean
  busy?: boolean
  onSaved?: (hasNote: boolean) => void
}) {
  const [row, setRow] = useState<BookingInternalNoteRow | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!props.isOwner) {
      setRow(null)
      setDraft('')
      setSavedAt(null)
      setError(null)
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('booking_internal_notes')
          .select('*')
          .eq('booking_id', props.bookingId)
          .maybeSingle()
        if (!mounted) return
        if (error) throw error
        const r = (data as BookingInternalNoteRow | null) ?? null
        setRow(r)
        setDraft(r?.body ?? '')
        setSavedAt(r?.updated_at ?? null)
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento nota.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [props.bookingId, props.isOwner])

  const dirty = useMemo(() => (row?.body ?? '') !== draft, [draft, row?.body])

  return (
    <Card className="p-4" padded={false}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="tb-kicker">NOTE INTERNE</div>
          <div className="mt-1 text-xs text-white/60">Visibili solo all'owner. Brevi, operative.</div>
        </div>
        <Button
          type="button"
          disabled={loading || saving || !dirty || props.busy}
          onClick={() => {
            setError(null)
            setSaving(true)
            const body = draft.trim()
            ;(async () => {
              try {
                const { data, error } = await supabase
                  .from('booking_internal_notes')
                  .upsert({ booking_id: props.bookingId, body })
                  .select('*')
                  .single()
                if (error) throw error
                const r = data as BookingInternalNoteRow
                setRow(r)
                setDraft(r.body)
                setSavedAt(r.updated_at)
                props.onSaved?.(Boolean(r.body.trim()))
              } catch (e: unknown) {
                setError(errorMessage(e, 'Errore salvataggio nota.'))
              } finally {
                setSaving(false)
              }
            })()
          }}
          size="sm"
          leftIcon={<Save className="h-4 w-4" />}
        >
          {saving ? 'Salvataggio…' : 'Salva'}
        </Button>
      </div>

      {error && <Alert className="mt-3" tone="danger">{error}</Alert>}

      {!props.isOwner ? (
        <Alert className="mt-3" tone="warning">
          Solo l'owner può leggere e modificare le note interne.
        </Alert>
      ) : null}

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={!props.isOwner}
        placeholder={loading ? 'Caricamento…' : 'Es: cliente chiede posto vicino finestra; preferisce WhatsApp.'}
        rows={4}
        className="mt-3 resize-none"
      />

      <div className="mt-2 flex items-center justify-between text-[11px] text-white/60">
        <div>{dirty ? 'Modifiche non salvate.' : 'Allineato.'}</div>
        <div>{savedAt ? `Ultimo salvataggio: ${formatDateTime(savedAt)}` : ''}</div>
      </div>
    </Card>
  )
}
