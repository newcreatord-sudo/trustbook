import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, User, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { BookingRow, ServiceRow, BookingStatus } from '@/domain/supabase'
import { getWeekRange, startOfDay } from '@/utils/calendar'
import { bookingStatusLabel } from '@/utils/bookingUi'

type StaffMember = {
  id: string
  user_id: string
  role: string
  color: string
  max_simultaneous_bookings: number
  is_bookable: boolean
  first_name?: string
  last_name?: string
}

type BlockedSlot = {
  id: string
  staff_id: string | null
  start_at: string
  end_at: string
  reason: string | null
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readEmbeddedProfile(profiles: unknown): { first_name?: string; last_name?: string } {
  if (profiles === null || profiles === undefined) return {}
  let row: Record<string, unknown> | null = null
  if (isPlainObject(profiles)) row = profiles
  else if (Array.isArray(profiles) && profiles.length > 0 && isPlainObject(profiles[0])) row = profiles[0]
  if (!row) return {}
  const fn = row.first_name
  const ln = row.last_name
  return {
    first_name: typeof fn === 'string' ? fn : undefined,
    last_name: typeof ln === 'string' ? ln : undefined,
  }
}

function mapTeamMemberRow(row: unknown): StaffMember | null {
  if (!isPlainObject(row)) return null
  const id = row.id
  const user_id = row.user_id
  if (typeof id !== 'string' || typeof user_id !== 'string') return null
  const role = typeof row.role === 'string' ? row.role : 'staff'
  const color = typeof row.color === 'string' ? row.color : '#3b82f6'
  const max_simultaneous_bookings =
    typeof row.max_simultaneous_bookings === 'number' && Number.isFinite(row.max_simultaneous_bookings)
      ? Math.max(1, Math.floor(row.max_simultaneous_bookings))
      : 1
  const is_bookable = typeof row.is_bookable === 'boolean' ? row.is_bookable : true
  const names = readEmbeddedProfile(row.profiles)
  return {
    id,
    user_id,
    role,
    color,
    max_simultaneous_bookings,
    is_bookable,
    first_name: names.first_name,
    last_name: names.last_name,
  }
}

function parseBlockedSlotRow(row: unknown): BlockedSlot | null {
  if (!isPlainObject(row)) return null
  const id = row.id
  const start_at = row.start_at
  const end_at = row.end_at
  if (typeof id !== 'string' || typeof start_at !== 'string' || typeof end_at !== 'string') return null
  const staffRaw = row.staff_id
  const staff_id =
    staffRaw === null || typeof staffRaw === 'undefined'
      ? null
      : typeof staffRaw === 'string'
        ? staffRaw
        : null
  const reasonRaw = row.reason
  const reason =
    reasonRaw === null || typeof reasonRaw === 'undefined'
      ? null
      : typeof reasonRaw === 'string'
        ? reasonRaw
        : null
  return { id, staff_id, start_at, end_at, reason }
}

function parseBlockedSlots(data: unknown): BlockedSlot[] {
  if (!Array.isArray(data)) return []
  const out: BlockedSlot[] = []
  for (const row of data) {
    const b = parseBlockedSlotRow(row)
    if (b) out.push(b)
  }
  return out
}

/** staff_closures → stesso modello UI dei blocchi agenda */
function staffClosureToBlockedSlot(row: unknown): BlockedSlot | null {
  if (!isPlainObject(row)) return null
  const id = row.id
  const staff_id_raw = row.staff_id
  const start_at = row.start_at
  const end_at = row.end_at
  if (typeof id !== 'string' || typeof staff_id_raw !== 'string' || typeof start_at !== 'string' || typeof end_at !== 'string')
    return null
  const reasonRaw = row.reason
  const reason =
    typeof reasonRaw === 'string' && reasonRaw.length > 0 ? reasonRaw : 'Ferie/Assenza'
  return {
    id,
    staff_id: staff_id_raw,
    start_at,
    end_at,
    reason,
  }
}

function parseStaffClosuresAsBlocked(data: unknown): BlockedSlot[] {
  if (!Array.isArray(data)) return []
  const out: BlockedSlot[] = []
  for (const row of data) {
    const b = staffClosureToBlockedSlot(row)
    if (b) out.push(b)
  }
  return out
}

export default function SmartAgenda(props: {
  businessId: string
  bookings: BookingRow[]
  services: ServiceRow[]
  busy: boolean
  onAction: (action: 'confirm' | 'reject' | 'cancel' | 'no_show' | 'complete' | 'check_in', bookingId: string) => void
  onMove: (bookingId: string, newStart: string, newEnd: string, newStaffId: string | null) => void
}) {
  const { busy } = props
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('day')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [blocked, setBlocked] = useState<BlockedSlot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [teamRes, blockRes, closuresRes] = await Promise.all([
        supabase.from('team_members').select('*, profiles(first_name, last_name)').eq('business_id', props.businessId),
        supabase.from('blocked_slots').select('*').eq('business_id', props.businessId),
        supabase.from('staff_closures').select('*').eq('business_id', props.businessId),
      ])

      if (!teamRes.error && Array.isArray(teamRes.data)) {
        const mappedStaff = teamRes.data.map(mapTeamMemberRow).filter((x): x is StaffMember => x !== null)
        setStaff(mappedStaff)
      } else {
        setStaff([])
      }

      const manualBlocks = blockRes.error ? [] : parseBlockedSlots(blockRes.data)
      const closureBlocks = closuresRes.error ? [] : parseStaffClosuresAsBlocked(closuresRes.data)
      setBlocked([...manualBlocks, ...closureBlocks])
      setLoading(false)
    }
    load()
  }, [props.businessId])

  const range = useMemo(() => {
    if (mode === 'day') {
      const start = startOfDay(anchor)
      const end = new Date(start)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    } else if (mode === 'week') {
      return getWeekRange(anchor, true)
    } else {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999)
      return { start, end }
    }
  }, [anchor, mode])

  const rangeBookings = useMemo(() => {
    const startMs = range.start.getTime()
    const endMs = range.end.getTime()
    return props.bookings
      .filter((b) => {
        const t = new Date(b.start_at).getTime()
        return t >= startMs && t <= endMs
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
  }, [props.bookings, range])

  const handlePrev = () => {
    setAnchor((a) => {
      const d = new Date(a)
      if (mode === 'day') d.setDate(d.getDate() - 1)
      else if (mode === 'week') d.setDate(d.getDate() - 7)
      else d.setMonth(d.getMonth() - 1)
      return d
    })
  }

  const handleNext = () => {
    setAnchor((a) => {
      const d = new Date(a)
      if (mode === 'day') d.setDate(d.getDate() + 1)
      else if (mode === 'week') d.setDate(d.getDate() + 7)
      else d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  const formatHeader = () => {
    if (mode === 'day') return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(anchor)
    if (mode === 'week') return `Settimana del ${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(range.start)}`
    return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(anchor)
  }

  return (
    <div className="flex flex-col space-y-4">
      {/* Header controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Periodo precedente"
            onClick={handlePrev}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7CFF]/50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[min(100%,12rem)] text-center text-sm font-medium capitalize text-white">{formatHeader()}</span>
          <button
            type="button"
            aria-label="Periodo successivo"
            onClick={handleNext}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7CFF]/50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Vai a oggi"
            onClick={() => setAnchor(startOfDay(new Date()))}
            className="ml-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7CFF]/50 sm:ml-2"
          >
            Oggi
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1" role="group" aria-label="Scala tempo calendario">
          <button
            type="button"
            onClick={() => setMode('day')}
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7CFF]/50',
              mode === 'day' ? 'bg-[#4F7CFF] text-white' : 'text-white/60 hover:text-white',
            )}
          >
            Giorno
          </button>
          <button
            type="button"
            onClick={() => setMode('week')}
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7CFF]/50',
              mode === 'week' ? 'bg-[#4F7CFF] text-white' : 'text-white/60 hover:text-white',
            )}
          >
            Settimana
          </button>
          <button
            type="button"
            onClick={() => setMode('month')}
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7CFF]/50',
              mode === 'month' ? 'bg-[#4F7CFF] text-white' : 'text-white/60 hover:text-white',
            )}
          >
            Mese
          </button>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-white/50">
        Stati in italiano. Per modifiche complesse agli appuntamenti usa la scheda «Tutte» con i dettagli.
      </p>

      {/* Agenda Grid / List */}
      <div className="min-h-[500px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-white/50">Carico l&apos;agenda…</div>
        ) : rangeBookings.length === 0 && blocked.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center px-4 text-center text-white/55">
            <CalendarIcon className="mb-3 h-10 w-10 opacity-45" aria-hidden />
            <p className="text-sm font-medium text-white/75">Nessun appuntamento in questo periodo</p>
            <p className="mt-1 max-w-sm text-xs text-white/45">Prova altre date o torna alla lista «Tutte» per cercare per nome.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rangeBookings.map((b) => {
              const svc = props.services.find(s => s.id === b.service_id)
              const assignedStaff = b.staff_id ? staff.find((s) => s.id === b.staff_id) : undefined
              
              return (
                <div key={b.id} className="p-4 hover:bg-white/[0.02] transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">
                        {new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(b.start_at))} - {new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(b.end_at))}
                      </span>
                      <span
                        className={cn(
                          'max-w-[11rem] truncate text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                          b.status === 'confirmed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                          b.status === 'completed' ? 'bg-white/10 text-white border-white/20' :
                          b.status === 'no_show' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          b.status === 'pending_approval' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        )}
                        title={bookingStatusLabel(b.status as BookingStatus)}
                      >
                        {bookingStatusLabel(b.status as BookingStatus)}
                      </span>
                      {b.checked_in_at && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Check-in OK
                        </span>
                      )}
                      {b.overbooked === true && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border bg-orange-500/10 text-orange-400 border-orange-500/20 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Overbooking
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-white/70">
                      Servizio: <strong className="text-white">{svc?.name || 'Sconosciuto'}</strong>
                    </div>
                    <div className="mt-1 text-xs text-white/50 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      Staff: <span className="text-white/80" style={{ color: assignedStaff?.color || '#fff' }}>{assignedStaff ? `${assignedStaff.first_name} ${assignedStaff.last_name}` : 'Nessuno / Tutti'}</span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {b.status === 'confirmed' && !b.checked_in_at && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => props.onAction('check_in', b.id)}
                        className={cn(
                          'px-3 py-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 rounded-lg border border-emerald-500/20 transition',
                          busy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-500/20',
                        )}
                      >
                        Check-in
                      </button>
                    )}
                    {b.status === 'confirmed' && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const ns = prompt('Nuovo Staff ID (lascia vuoto per nessuno):', b.staff_id ?? '')
                            const d = prompt('Nuovo inizio (YYYY-MM-DDTHH:mm):', b.start_at)
                            if (ns !== null && d) {
                              const newEnd = new Date(new Date(d).getTime() + (new Date(b.end_at).getTime() - new Date(b.start_at).getTime())).toISOString()
                              props.onMove(b.id, new Date(d).toISOString(), newEnd, ns || null)
                            }
                          }}
                          className={cn(
                            'px-3 py-1.5 text-[11px] font-semibold text-white/70 bg-white/5 rounded-lg border border-white/10 transition',
                            busy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10',
                          )}
                        >
                          Sposta
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => props.onAction('complete', b.id)}
                          className={cn(
                            'px-3 py-1.5 text-[11px] font-semibold text-white bg-white/10 rounded-lg border border-white/20 transition',
                            busy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20',
                          )}
                        >
                          Completato
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => props.onAction('no_show', b.id)}
                          className={cn(
                            'px-3 py-1.5 text-[11px] font-semibold text-red-400 bg-red-500/10 rounded-lg border border-red-500/20 transition',
                            busy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-500/20',
                          )}
                        >
                          No-Show
                        </button>
                      </>
                    )}
                    {(b.status === 'pending_approval' || b.status === 'requested') && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => props.onAction('confirm', b.id)}
                          className={cn(
                            'px-3 py-1.5 text-[11px] font-semibold text-blue-400 bg-blue-500/10 rounded-lg border border-blue-500/20 transition',
                            busy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-500/20',
                          )}
                        >
                          Conferma
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => props.onAction('reject', b.id)}
                          className={cn(
                            'px-3 py-1.5 text-[11px] font-semibold text-red-400 bg-red-500/10 rounded-lg border border-red-500/20 transition',
                            busy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-500/20',
                          )}
                        >
                          Rifiuta
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Render blocked slots as simple rows for now */}
            {blocked.filter(b => new Date(b.start_at) >= range.start && new Date(b.start_at) <= range.end).map(blk => (
              <div key={blk.id} className="p-4 bg-red-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-red-500/50">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">
                      {new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(blk.start_at))} - {new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(blk.end_at))}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border bg-red-500/10 text-red-400 border-red-500/20 flex items-center gap-1">
                      Blocco / Chiusura
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/70">
                    Motivo: <strong className="text-white">{blk.reason || 'Nessun motivo'}</strong>
                  </div>
                  <div className="mt-1 text-xs text-white/50 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    Staff: <span className="text-white/80">{blk.staff_id ? staff.find(s => s.id === blk.staff_id)?.first_name : 'Tutto il business'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
