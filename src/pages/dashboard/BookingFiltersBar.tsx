import { X } from 'lucide-react'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'
import Tabs from '@/shared/ui/Tabs'

export type BookingFilterKey = 'all' | 'today' | 'pending' | 'deposit' | 'confirmed' | 'closed'

export type BookingSortKey = 'upcoming' | 'recent' | 'pending_first'

export default function BookingFiltersBar(props: {
  value: BookingFilterKey
  onChange: (next: BookingFilterKey) => void
  query: string
  onQueryChange: (next: string) => void
  sort: BookingSortKey
  onSortChange: (next: BookingSortKey) => void
  onReset: () => void
  counts: Record<BookingFilterKey, number>
}) {
  const items: Array<{ key: BookingFilterKey; label: string; badge: number }> = [
    { key: 'all', label: 'Tutte', badge: props.counts.all ?? 0 },
    { key: 'today', label: 'Oggi · calendario', badge: props.counts.today ?? 0 },
    { key: 'pending', label: 'In attesa', badge: props.counts.pending ?? 0 },
    { key: 'deposit', label: 'Caparra', badge: props.counts.deposit ?? 0 },
    { key: 'confirmed', label: 'Confermate', badge: props.counts.confirmed ?? 0 },
    { key: 'closed', label: 'Chiuse', badge: props.counts.closed ?? 0 },
  ]

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-1 overflow-x-auto px-1">
          <Tabs
            value={props.value}
            onChange={(k) => props.onChange(k as BookingFilterKey)}
            items={items}
            className="min-w-0 sm:min-w-[560px]"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:items-center">
          <div className="relative">
            <Input
              value={props.query}
              onChange={(e) => props.onQueryChange(e.target.value)}
              placeholder="Cerca cliente…"
              className="pr-10"
            />
            {props.query ? (
              <button
                type="button"
                onClick={() => props.onQueryChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Cancella ricerca"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <Select value={props.sort} onChange={(e) => props.onSortChange(e.target.value as BookingSortKey)}>
            <option value="upcoming">Ordina: Prossime</option>
            <option value="recent">Ordina: Più recenti</option>
            <option value="pending_first">Ordina: In attesa prima</option>
          </Select>
        </div>
      </div>

      {(props.value !== 'all' || props.query.trim() || props.sort !== 'upcoming') && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-xs text-white/70">
            Stai vedendo:{' '}
            <span className="text-white">
              {props.value !== 'all' ? items.find((x) => x.key === props.value)?.label ?? props.value : 'Tutte'}
            </span>
            {props.query.trim() ? <span className="text-white/60"> · “{props.query.trim()}”</span> : null}
          </div>
          <button type="button" onClick={props.onReset} className="text-xs font-semibold text-white/60 hover:text-white">
            Reset
          </button>
        </div>
      )}
    </div>
  )
}
