import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { BusinessClosureRow, BusinessOpeningWindowRow } from '@/domain/supabase'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'

const weekdayLabels: Record<number, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mer',
  4: 'Gio',
  5: 'Ven',
  6: 'Sab',
}

function asTime(value: string): string {
  const v = value.trim()
  if (/^\d{2}:\d{2}$/.test(v)) return v
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5)
  return '09:00'
}

function timeToMinutes(t: string): number {
  const v = asTime(t)
  const [hh, mm] = v.split(':').map((x) => Number(x))
  return (hh || 0) * 60 + (mm || 0)
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

export default function ScheduleManager(props: {
  businessId: string
  windows: BusinessOpeningWindowRow[]
  closures: BusinessClosureRow[]
  onWindowsChanged: (next: BusinessOpeningWindowRow[]) => void
  onClosuresChanged: (next: BusinessClosureRow[]) => void
}) {
  const [weekday, setWeekday] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('13:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [closureStart, setClosureStart] = useState('')
  const [closureEnd, setClosureEnd] = useState('')
  const [closureReason, setClosureReason] = useState('')

  const grouped = useMemo(() => {
    const map: Record<number, BusinessOpeningWindowRow[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
    for (const w of props.windows) {
      map[w.weekday] = [...(map[w.weekday] ?? []), w]
    }
    for (const k of Object.keys(map)) {
      const n = Number(k)
      map[n] = (map[n] ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return map
  }, [props.windows])

  return (
    <div className="space-y-4">
      <Card padded={false} className="p-5">
        <div className="tb-title">Orari di apertura</div>
        <div className="tb-subtitle mt-1">Aggiungi finestre per ogni giorno (es. 09:00-13:00 e 15:00-19:00).</div>

        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="tb-label">Giorno</label>
            <Select value={weekday} onChange={(e) => setWeekday(e.target.value)} className="mt-1">
              {Object.keys(weekdayLabels).map((k) => (
                <option key={k} value={k}>
                  {weekdayLabels[Number(k)]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="tb-label">Inizio</label>
            <Input
              value={startTime}
              onChange={(e) => setStartTime(asTime(e.target.value))}
              className="mt-1"
              placeholder="09:00"
            />
          </div>
          <div>
            <label className="tb-label">Fine</label>
            <Input
              value={endTime}
              onChange={(e) => setEndTime(asTime(e.target.value))}
              className="mt-1"
              placeholder="13:00"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={saving}
              leftIcon={<Plus className="h-4 w-4" />}
              className="w-full"
              onClick={() => {
                setError(null)
                const wd = Number(weekday)
                const s = asTime(startTime)
                const e = asTime(endTime)
                if (s >= e) return setError('Orario non valido: inizio deve essere < fine.')

                const sMin = timeToMinutes(s)
                const eMin = timeToMinutes(e)
                const existing = props.windows.filter((x) => x.weekday === wd)
                const conflict = existing.find((w) => {
                  const ws = timeToMinutes(w.start_time)
                  const we = timeToMinutes(w.end_time)
                  return overlaps(sMin, eMin, ws, we)
                })
                if (conflict) {
                  return setError(
                    `Sovrapposizione: ${weekdayLabels[wd]} ${asTime(conflict.start_time)}-${asTime(conflict.end_time)}.`,
                  )
                }

                setSaving(true)
                ;(async () => {
                  try {
                    const { data, error } = await supabase
                      .from('business_opening_windows')
                      .insert({
                        business_id: props.businessId,
                        weekday: wd,
                        start_time: `${s}:00`,
                        end_time: `${e}:00`,
                      })
                      .select('*')
                      .single()
                    if (error) throw error
                    props.onWindowsChanged([data as BusinessOpeningWindowRow, ...props.windows])
                  } catch (e: unknown) {
                    setError(errorMessage(e, 'Errore creazione orario.'))
                  } finally {
                    setSaving(false)
                  }
                })()
              }}
            >
              Aggiungi
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {Object.keys(weekdayLabels)
            .map((k) => Number(k))
            .map((wd) => (
              <div key={wd} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs font-semibold tracking-wide text-white/60">{weekdayLabels[wd]}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(grouped[wd] ?? []).length === 0 ? (
                    <div className="text-sm text-white/60">Nessuna finestra</div>
                  ) : (
                    grouped[wd].map((w) => (
                      <div
                        key={w.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
                      >
                        {asTime(w.start_time)}-{asTime(w.end_time)}
                        <button
                          type="button"
                          onClick={() => {
                            setError(null)
                            setSaving(true)
                            ;(async () => {
                              try {
                                const { error } = await supabase
                                  .from('business_opening_windows')
                                  .delete()
                                  .eq('id', w.id)
                                if (error) throw error
                                props.onWindowsChanged(props.windows.filter((x) => x.id !== w.id))
                              } catch (e: unknown) {
                                setError(errorMessage(e, 'Errore rimozione.'))
                              } finally {
                                setSaving(false)
                              }
                            })()
                          }}
                          className="text-white/70 hover:text-white"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
        </div>
      </Card>

      <Card padded={false} className="p-5">
        <div className="tb-title">Ferie / chiusure</div>
        <div className="tb-subtitle mt-1">Blocca periodi senza cancellare a mano.</div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="tb-label">Da</label>
            <Input
              type="datetime-local"
              value={closureStart}
              onChange={(e) => setClosureStart(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="tb-label">A</label>
            <Input
              type="datetime-local"
              value={closureEnd}
              onChange={(e) => setClosureEnd(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="tb-label">Motivo (facoltativo)</label>
            <Input
              value={closureReason}
              onChange={(e) => setClosureReason(e.target.value)}
              className="mt-1"
              placeholder="ferie, pausa, chiusura…"
            />
          </div>
        </div>

        <Button
          type="button"
          disabled={saving}
          leftIcon={<Plus className="h-4 w-4" />}
          className="mt-4 w-full"
          onClick={() => {
            setError(null)
            if (!closureStart || !closureEnd) return setError('Inserisci date inizio/fine.')
            const start = new Date(closureStart)
            const end = new Date(closureEnd)
            if (!(start.getTime() < end.getTime())) return setError('Intervallo non valido.')

            const overlapExisting = props.closures.find((c) => {
              const cs = new Date(c.start_at).getTime()
              const ce = new Date(c.end_at).getTime()
              return overlaps(start.getTime(), end.getTime(), cs, ce)
            })
            if (overlapExisting) {
              return setError('Intervallo sovrapposto a una chiusura già presente.')
            }
            setSaving(true)
            ;(async () => {
              try {
                const { data, error } = await supabase
                  .from('business_closures')
                  .insert({
                    business_id: props.businessId,
                    start_at: start.toISOString(),
                    end_at: end.toISOString(),
                    reason: closureReason.trim() || null,
                  })
                  .select('*')
                  .single()
                if (error) throw error
                props.onClosuresChanged([data as BusinessClosureRow, ...props.closures])
                setClosureStart('')
                setClosureEnd('')
                setClosureReason('')
              } catch (e: unknown) {
                setError(errorMessage(e, 'Errore creazione chiusura.'))
              } finally {
                setSaving(false)
              }
            })()
          }}
        >
          Aggiungi chiusura
        </Button>

        <div className="mt-4 space-y-2">
          {props.closures.length === 0 ? (
            <EmptyState title="Nessuna chiusura" description="Non ci sono ferie o chiusure pianificate." />
          ) : (
            props.closures
              .slice()
              .sort((a, b) => b.start_at.localeCompare(a.start_at))
              .map((c) => (
                <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {new Date(c.start_at).toLocaleString('it-IT')} → {new Date(c.end_at).toLocaleString('it-IT')}
                      </div>
                      {c.reason && <div className="mt-1 text-xs text-white/70">{c.reason}</div>}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setError(null)
                        setSaving(true)
                        ;(async () => {
                          try {
                            const { error } = await supabase.from('business_closures').delete().eq('id', c.id)
                            if (error) throw error
                            props.onClosuresChanged(props.closures.filter((x) => x.id !== c.id))
                          } catch (e: unknown) {
                            setError(errorMessage(e, 'Errore rimozione.'))
                          } finally {
                            setSaving(false)
                          }
                        })()
                      }}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                    >
                      Rimuovi
                    </Button>
                  </div>
                </div>
              ))
          )}
        </div>
      </Card>
    </div>
  )
}
