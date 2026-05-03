import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react'
import type { ServiceRow } from '@/domain/supabase'
import type { BusinessFeatureGate } from '@/lib/subscriptions'
import { canAddService } from '@/lib/subscriptions'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { formatMoneyEUR } from '@/utils/time'
import Card from '@/shared/ui/Card'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'
import Button from '@/shared/ui/Button'
import Input from '@/shared/ui/Input'
import ListToolbar from '@/shared/ui/ListToolbar'

export default function ServicesManager(props: {
  businessId: string
  services: ServiceRow[]
  onChanged: (next: ServiceRow[]) => void
  featureGate: BusinessFeatureGate
  onNavigateSubscription?: () => void
}) {
  const [name, setName] = useState('')
  const [durationMin, setDurationMin] = useState('45')
  const [priceCents, setPriceCents] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'newest' | 'name' | 'duration'>('newest')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDurationMin, setEditDurationMin] = useState('45')
  const [editPriceCents, setEditPriceCents] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const editingService = useMemo(() => {
    if (!editingId) return null
    return props.services.find((s) => s.id === editingId) ?? null
  }, [editingId, props.services])

  const deleteService = useMemo(() => {
    if (!confirmDeleteId) return null
    return props.services.find((s) => s.id === confirmDeleteId) ?? null
  }, [confirmDeleteId, props.services])

  useEffect(() => {
    setError(null)
    setEditingId(null)
    setConfirmDeleteId(null)
    setQuery('')
    setSort('newest')
  }, [props.businessId])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = !q
      ? props.services
      : props.services.filter((s) => s.name.toLowerCase().includes(q))

    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'duration') return a.duration_min - b.duration_min
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return sorted
  }, [props.services, query, sort])

  const serviceLimitReached = useMemo(
    () => !canAddService(props.services.length, props.featureGate),
    [props.services.length, props.featureGate],
  )

  const resetList = () => {
    setQuery('')
    setSort('newest')
  }

  const normalizeDuration = (raw: string) => {
    const n = Math.floor(Number(raw) || 0)
    return Math.max(5, Math.min(600, n))
  }

  const normalizePrice = (raw: string) => {
    if (!raw.trim()) return null
    const n = Math.floor(Number(raw) || 0)
    return Math.max(0, n)
  }

  return (
    <div className="space-y-4">
      <ListToolbar
        title="Servizi"
        subtitle="Durata e prezzo per ogni servizio."
        query={query}
        onQueryChange={setQuery}
        queryPlaceholder="Cerca servizio…"
        sort={{
          value: sort,
          onChange: (v) => {
            if (v === 'newest' || v === 'name' || v === 'duration') setSort(v)
          },
          options: [
            { value: 'newest', label: 'Ordina: più recenti' },
            { value: 'name', label: 'Ordina: nome (A–Z)' },
            { value: 'duration', label: 'Ordina: durata' },
          ],
        }}
        onReset={resetList}
        busy={saving}
      />

      {error && (
        <Alert tone="danger">{error}</Alert>
      )}

      {serviceLimitReached ? (
        <Alert tone="warning">
          <span className="block">
            Limite piano:{' '}
            {props.featureGate.maxServices >= 999
              ? 'servizi illimitati sul piano attuale'
              : `massimo ${props.featureGate.maxServices} servizi`}{' '}
            (attuali: {props.services.length}). Elimina servizi non usati o aggiorna il piano.
          </span>
          {props.onNavigateSubscription ? (
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={props.onNavigateSubscription}>
              Tab Abbonamento
            </Button>
          ) : null}
        </Alert>
      ) : null}

      <Card padded={false} className="p-5">
        {props.services.length === 0 ? (
          <EmptyState
            title="Nessun servizio ancora"
            description="Crea il primo servizio per ricevere prenotazioni in modo chiaro."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Nessun risultato"
            description={query.trim() ? `Nessun servizio corrisponde a “${query.trim()}”.` : 'Prova a cambiare filtri.'}
            action={
              <Button type="button" variant="secondary" onClick={resetList}>
                Reset
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {visible.map((s) => (
              <div key={s.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{s.name}</div>
                  <div className="mt-1 text-xs text-white/70">
                    Durata: {s.duration_min} min
                    {s.price_cents !== null ? ` · Prezzo: ${formatMoneyEUR(s.price_cents)}` : ''}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={saving}
                    leftIcon={<Pencil className="h-4 w-4" />}
                    onClick={() => {
                      setError(null)
                      setEditingId(s.id)
                      setEditName(s.name)
                      setEditDurationMin(String(s.duration_min))
                      setEditPriceCents(s.price_cents === null ? '' : String(s.price_cents))
                    }}
                  >
                    Modifica
                  </Button>

                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={saving}
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setConfirmDeleteId(s.id)}
                  >
                    Elimina
                  </Button>

                  <Button
                    type="button"
                    variant={s.is_active ? 'success' : 'secondary'}
                    size="sm"
                    disabled={saving}
                    leftIcon={s.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    onClick={() => {
                      setError(null)
                      setSaving(true)
                      ;(async () => {
                        try {
                          const { data, error } = await supabase
                            .from('services')
                            .update({ is_active: !s.is_active })
                            .eq('id', s.id)
                            .select('*')
                            .single()
                          if (error) throw error
                          const updated = data as ServiceRow
                          props.onChanged(props.services.map((x) => (x.id === updated.id ? updated : x)))
                        } catch (e: unknown) {
                          setError(errorMessage(e, 'Errore aggiornamento.'))
                        } finally {
                          setSaving(false)
                        }
                      })()
                    }}
                  >
                    {s.is_active ? 'Attivo' : 'Disattivato'}
                  </Button>
                </div>
              </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editingService && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Modifica servizio</div>
                <div className="mt-1 text-xs text-white/70">Aggiorna nome, durata e prezzo.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (saving) return
                  setEditingId(null)
                }}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="tb-label">Nome</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="tb-label">Durata (min)</label>
                  <Input
                    value={editDurationMin}
                    onChange={(e) => setEditDurationMin(e.target.value)}
                    inputMode="numeric"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="tb-label">Prezzo (cent, facoltativo)</label>
                  <Input
                    value={editPriceCents}
                    onChange={(e) => setEditPriceCents(e.target.value)}
                    inputMode="numeric"
                    placeholder="es. 2500"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditingId(null)}>
                  Annulla
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  leftIcon={<Check className="h-4 w-4" />}
                  onClick={() => {
                    const nextName = editName.trim()
                    if (!nextName) return setError('Nome servizio obbligatorio.')
                    const d = normalizeDuration(editDurationMin)
                    const p = normalizePrice(editPriceCents)
                    setSaving(true)
                    ;(async () => {
                      try {
                        const { data, error } = await supabase
                          .from('services')
                          .update({ name: nextName, duration_min: d, price_cents: p })
                          .eq('id', editingService.id)
                          .select('*')
                          .single()
                        if (error) throw error
                        const updated = data as ServiceRow
                        props.onChanged(props.services.map((x) => (x.id === updated.id ? updated : x)))
                        setEditingId(null)
                      } catch (e: unknown) {
                        setError(errorMessage(e, 'Errore aggiornamento servizio.'))
                      } finally {
                        setSaving(false)
                      }
                    })()
                  }}
                >
                  Salva
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteService)}
        title="Eliminare servizio?"
        description={deleteService ? `"${deleteService.name}" verrà rimosso.` : undefined}
        confirmText="Elimina"
        tone="danger"
        busy={saving}
        onCancel={() => {
          if (saving) return
          setConfirmDeleteId(null)
        }}
        onConfirm={() => {
          if (!deleteService) return
          setError(null)
          setSaving(true)
          ;(async () => {
            try {
              const { error } = await supabase.from('services').delete().eq('id', deleteService.id)
              if (error) throw error
              props.onChanged(props.services.filter((x) => x.id !== deleteService.id))
              setConfirmDeleteId(null)
            } catch (e: unknown) {
              setError(errorMessage(e, 'Errore eliminazione servizio.'))
            } finally {
              setSaving(false)
            }
          })()
        }}
      />

      <Card padded={false} className="p-4">
        <div className="tb-kicker">AGGIUNGI SERVIZIO</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="tb-label">Nome</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="Taglio, Tavolo 2 persone, Corsa aeroporto…"
            />
          </div>
          <div>
            <label className="tb-label">Durata (min)</label>
            <Input
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              inputMode="numeric"
              className="mt-1"
            />
          </div>
          <div className="md:col-span-3">
            <label className="tb-label">Prezzo (cent, facoltativo)</label>
            <Input
              value={priceCents}
              onChange={(e) => setPriceCents(e.target.value)}
              inputMode="numeric"
              className="mt-1"
              placeholder="es. 2500"
            />
          </div>
        </div>

        <Button
          type="button"
          disabled={saving || serviceLimitReached}
          leftIcon={<Plus className="h-4 w-4" />}
          className="mt-4 w-full"
          onClick={() => {
            setError(null)
            const d = normalizeDuration(durationMin)
            if (!name.trim()) return setError('Nome servizio obbligatorio.')
            if (!canAddService(props.services.length, props.featureGate)) {
              return setError(
                `Limite piano raggiunto (max ${props.featureGate.maxServices} servizi). Vai alla tab Abbonamento.`,
              )
            }
            const p = normalizePrice(priceCents)

            setSaving(true)
            ;(async () => {
              try {
                const { data, error } = await supabase
                  .from('services')
                  .insert({
                    business_id: props.businessId,
                    name: name.trim(),
                    duration_min: d,
                    price_cents: p,
                    is_active: true,
                  })
                  .select('*')
                  .single()
                if (error) throw error
                props.onChanged([data as ServiceRow, ...props.services])
                setName('')
                setDurationMin('45')
                setPriceCents('')
              } catch (e: unknown) {
                setError(errorMessage(e, 'Errore creazione servizio.'))
              } finally {
                setSaving(false)
              }
            })()
          }}
        >
          Aggiungi
        </Button>
      </Card>
    </div>
  )
}
