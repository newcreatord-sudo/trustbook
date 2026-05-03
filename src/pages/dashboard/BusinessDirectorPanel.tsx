import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/utils/time'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import Input from '@/shared/ui/Input'
import Textarea from '@/shared/ui/Textarea'
import type { BusinessOperationalNoteRow } from '@/lib/businessOperationalNotes'
import { deleteBusinessOperationalNote, listBusinessOperationalNotes, upsertBusinessOperationalNote } from '@/lib/businessOperationalNotes'

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export default function BusinessDirectorPanel(props: { businessId: string; isOwner: boolean }) {
  const [rows, setRows] = useState<BusinessOperationalNoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftTags, setDraftTags] = useState('')
  const [draftPinned, setDraftPinned] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const data = await listBusinessOperationalNotes({ businessId: props.businessId, limit: 50 })
        if (!mounted) return
        setRows(data)
        if (!selectedId && data[0]?.id) {
          setSelectedId(data[0].id)
        }
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento note.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [props.businessId, selectedId])

  const selected = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  )

  useEffect(() => {
    if (!selected) {
      setDraftTitle('')
      setDraftBody('')
      setDraftTags('')
      setDraftPinned(false)
      return
    }
    setDraftTitle(selected.title ?? '')
    setDraftBody(selected.body ?? '')
    setDraftTags((selected.tags ?? []).join(', '))
    setDraftPinned(Boolean(selected.pinned))
  }, [selected])

  const dirty = useMemo(() => {
    if (!selected) return Boolean(draftTitle.trim() || draftBody.trim() || draftTags.trim() || draftPinned)
    const tags = parseTags(draftTags)
    const a = {
      title: (selected.title ?? '').trim(),
      body: (selected.body ?? '').trim(),
      tags: selected.tags ?? [],
      pinned: Boolean(selected.pinned),
    }
    const b = { title: draftTitle.trim(), body: draftBody.trim(), tags, pinned: draftPinned }
    return JSON.stringify(a) !== JSON.stringify(b)
  }, [selected, draftTitle, draftBody, draftTags, draftPinned])

  const canEdit = props.isOwner

  const reload = async (preferId?: string | null) => {
    const data = await listBusinessOperationalNotes({ businessId: props.businessId, limit: 50 })
    setRows(data)
    if (preferId && data.some((r) => r.id === preferId)) {
      setSelectedId(preferId)
      return
    }
    if (!data.some((r) => r.id === selectedId)) {
      setSelectedId(data[0]?.id ?? null)
    }
  }

  return (
    <Card padded={false} className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="tb-kicker">DIREZIONE</div>
          <div className="mt-1 text-base font-semibold text-white">Appunti operativi</div>
          <div className="mt-1 text-xs text-white/60">
            Note per staff e owner. L’AI può scrivere solo se autorizzata dall’attività.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canEdit || loading || saving}
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={async () => {
              setError(null)
              setSaving(true)
              try {
                const id = await upsertBusinessOperationalNote({
                  businessId: props.businessId,
                  title: 'Nuova nota',
                  body: '',
                  tags: [],
                  pinned: false,
                })
                await reload(id)
              } catch (e: unknown) {
                setError(errorMessage(e, 'Errore creazione nota.'))
              } finally {
                setSaving(false)
              }
            }}
          >
            Nuova
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={!canEdit || loading || saving || !dirty}
            leftIcon={<Save className="h-4 w-4" />}
            onClick={async () => {
              setError(null)
              setSaving(true)
              try {
                const id = await upsertBusinessOperationalNote({
                  businessId: props.businessId,
                  noteId: selectedId,
                  title: draftTitle.trim() || null,
                  body: draftBody,
                  tags: parseTags(draftTags),
                  pinned: draftPinned,
                })
                await reload(id)
              } catch (e: unknown) {
                setError(errorMessage(e, 'Errore salvataggio nota.'))
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Salvataggio…' : 'Salva'}
          </Button>
        </div>
      </div>

      {error && <Alert className="mt-3" tone="danger">{error}</Alert>}
      {!props.isOwner && (
        <Alert className="mt-3" tone="warning">
          Solo l’owner può creare e modificare le note. Puoi leggerle.
        </Alert>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Note</div>
            <div className="text-xs text-white/40">{rows.length}</div>
          </div>
          <div className="space-y-2">
            {loading ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">Caricamento…</div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">Nessuna nota.</div>
            ) : (
              rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    r.id === selectedId ? 'border-cyan-500 bg-cyan-950/20' : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-white">{r.title ?? 'Senza titolo'}</div>
                    {r.pinned ? <div className="text-[10px] text-cyan-300">PIN</div> : null}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-white/55">{r.body || '—'}</div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-white/45">
                    <div className="truncate">{(r.tags ?? []).slice(0, 3).join(' · ')}</div>
                    <div>{formatDateTime(r.updated_at)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {!selected ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
              Seleziona una nota o creane una nuova.
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-white/60">Titolo</div>
                  <Input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    disabled={!canEdit}
                    className="mt-2"
                    placeholder="Es. Operativo: turni & tavoli finestra"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-white/60">
                    <input
                      type="checkbox"
                      checked={draftPinned}
                      onChange={(e) => setDraftPinned(e.target.checked)}
                      disabled={!canEdit}
                    />
                    Pin
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={!canEdit || saving}
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    onClick={async () => {
                      setError(null)
                      setSaving(true)
                      try {
                        await deleteBusinessOperationalNote({ businessId: props.businessId, noteId: selected.id })
                        await reload(null)
                      } catch (e: unknown) {
                        setError(errorMessage(e, 'Errore eliminazione nota.'))
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    Elimina
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs text-white/60">Tag (separati da virgola)</div>
                <Input
                  value={draftTags}
                  onChange={(e) => setDraftTags(e.target.value)}
                  disabled={!canEdit}
                  className="mt-2"
                  placeholder="es. vip, finestra, caparra, staff"
                />
              </div>

              <div className="mt-4">
                <div className="text-xs text-white/60">Corpo</div>
                <Textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  disabled={!canEdit}
                  rows={8}
                  className="mt-2 resize-none"
                  placeholder="Scrivi qui appunti operativi: policy tavoli, clienti ricorrenti, turni, blocchi sala..."
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-white/55">
                <div>{dirty ? 'Modifiche non salvate.' : 'Allineato.'}</div>
                <div>{selected.updated_at ? `Ultimo salvataggio: ${formatDateTime(selected.updated_at)}` : ''}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
