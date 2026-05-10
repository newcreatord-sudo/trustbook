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
    { key: 'today', label: 'Solo oggi', badge: props.counts.today ?? 0 },
    { key: 'pending', label: 'Da confermare', badge: props.counts.pending ?? 0 },
    { key: 'deposit', label: 'Caparra da pagare', badge: props.counts.deposit ?? 0 },
    { key: 'confirmed', label: 'Confermate', badge: props.counts.confirmed ?? 0 },
    { key: 'closed', label: 'Archiviate', badge: props.counts.closed ?? 0 },
  ]

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4" aria-label="Filtri appuntamenti">
      <div className="mb-3">
        <div className="tb-label">Filtra la lista</div>
        <p className="mt-1 text-[11px] leading-snug text-white/50">
          Conteggi sul campione caricato in pagina. «Solo oggi» non è il tab Calendario: mostra gli appuntamenti di oggi in lista.
        </p>
      </div>
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
            <label htmlFor="booking-search-query" className="sr-only">
              Cerca per nome o telefono cliente
            </label>
            <Input
              id="booking-search-query"
              value={props.query}
              onChange={(e) => props.onQueryChange(e.target.value)}
              placeholder="Nome o telefono cliente…"
              autoComplete="off"
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

          <div>
            <label htmlFor="booking-sort-order" className="tb-label sr-only md:not-sr-only md:mb-1 md:block">
              Ordine elenco
            </label>
            <Select
              id="booking-sort-order"
              value={props.sort}
              onChange={(e) => props.onSortChange(e.target.value as BookingSortKey)}
              aria-label="Ordine elenco appuntamenti"
            >
              <option value="upcoming">Dal più vicino al più lontano</option>
              <option value="recent">Dal più recente</option>
              <option value="pending_first">Prima le richieste da gestire</option>
            </Select>
          </div>
        </div>
      </div>

      {(props.value !== 'all' || props.query.trim() || props.sort !== 'upcoming') && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-xs text-white/70">
            Vista attiva:{' '}
            <span className="text-white">
              {props.value !== 'all' ? items.find((x) => x.key === props.value)?.label ?? props.value : 'Tutte'}
            </span>
            {props.query.trim() ? <span className="text-white/60"> · ricerca «{props.query.trim()}»</span> : null}
          </div>
          <button
            type="button"
            onClick={props.onReset}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-[#7D9BFF] hover:bg-white/10 hover:text-white"
          >
            Ripristina filtri
          </button>
        </div>
      )}
    </section>
  )
}
