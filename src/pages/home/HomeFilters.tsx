import { Filter, Loader2, MapPinned, Search, X, CalendarClock, Euro } from 'lucide-react'
import { cn } from '@/lib/utils'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'
import type { BusinessSortKey } from '@/pages/home/searchSort'
export default function HomeFilters(props: {
  query: string
  onQueryChange: (v: string) => void
  queryDirty?: boolean
  /** Opzioni select categoria = playbook UI ∪ categorie effettive nei dati caricati */
  categoryOptions: readonly string[]
  category: string
  onCategoryChange: (v: string) => void
  availabilityFilter: string
  onAvailabilityFilterChange: (v: string) => void
  priceFilter: string
  onPriceFilterChange: (v: string) => void
  userLoc: { lat: number; lng: number } | null
  geoError: string | null
  onRequestLocation: () => void
  geoBusy?: boolean
  maxDistanceKm: number | null
  onMaxDistanceKmChange: (v: number | null) => void
  sort: BusinessSortKey
  onSortChange: (v: BusinessSortKey) => void
  onReset: () => void
}) {
  return (
    <div className="tb-card p-4 md:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Esplora attività</div>
            <div className="mt-1 text-xs text-white/70">Cerca per nome, servizio, città, CAP o indirizzo. Filtra per distanza usando la posizione.</div>
            {props.userLoc ? <div className="mt-2 text-xs text-white/60">Posizione attiva · filtri distanza disponibili</div> : null}
          </div>

          <button
            type="button"
            onClick={props.onReset}
            className="text-xs font-semibold text-white/60 hover:text-white md:self-start"
          >
            Reset filtri
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-center">
          <div className="relative md:col-span-12 lg:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
            <Input
              value={props.query}
              onChange={(e) => props.onQueryChange(e.target.value)}
              placeholder="Cerca (nome, servizio, città, indirizzo)"
              className={cn('pl-10 pr-10', props.queryDirty && 'opacity-90')}
              inputMode="search"
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

          <div className="relative md:col-span-4 lg:col-span-3">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
            <Select value={props.category} onChange={(e) => props.onCategoryChange(e.target.value)} className="pl-10">
              <option value="">Tutte le categorie</option>
              {props.categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div className="relative md:col-span-4 lg:col-span-3">
            <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
            <Select value={props.availabilityFilter} onChange={(e) => props.onAvailabilityFilterChange(e.target.value)} className="pl-10">
              <option value="">Qualsiasi disponibilità</option>
              <option value="today">Aperto oggi</option>
              <option value="tomorrow">Aperto domani</option>
            </Select>
          </div>

          <div className="relative md:col-span-4 lg:col-span-2">
            <Euro className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
            <Select value={props.priceFilter} onChange={(e) => props.onPriceFilterChange(e.target.value)} className="pl-10">
              <option value="">Prezzo</option>
              <option value="low">Fino a 25€</option>
              <option value="medium">25€ - 60€</option>
              <option value="high">Oltre 60€</option>
            </Select>
          </div>

          <div className="md:col-span-4 lg:col-span-3">
            <Button
              type="button"
              onClick={props.onRequestLocation}
              variant="secondary"
              size="sm"
              className="w-full"
              leftIcon={props.geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />}
            >
              {props.geoBusy ? 'Attivo…' : 'Posizione'}
            </Button>
          </div>

          <div className="md:col-span-4 lg:col-span-3">
            <Select
              value={props.maxDistanceKm === null ? '' : String(props.maxDistanceKm)}
              onChange={(e) => {
                const v = e.target.value
                props.onMaxDistanceKmChange(v ? Number(v) : null)
              }}
              disabled={!props.userLoc}
              className={cn(!props.userLoc && 'opacity-60')}
            >
              <option value="">Distanza: tutte</option>
              <option value="2">Entro 2 km</option>
              <option value="5">Entro 5 km</option>
              <option value="10">Entro 10 km</option>
              <option value="25">Entro 25 km</option>
              <option value="50">Entro 50 km</option>
            </Select>
          </div>

          <div className="md:col-span-4 lg:col-span-6">
            <Select
              value={props.sort}
              onChange={(e) => props.onSortChange(e.target.value as BusinessSortKey)}
              className="text-sm"
            >
              <option value="newest">Ordina: Novità</option>
              <option value="rating">Ordina: Valutazione</option>
              <option value="relevance">Ordina: Pertinenza</option>
              <option value="distance" disabled={!props.userLoc}>
                Ordina: Distanza{props.userLoc ? '' : ' (attiva posizione)'}
              </option>
            </Select>
          </div>
        </div>

        {props.geoError ? <Alert tone="danger">{props.geoError}</Alert> : null}
      </div>
    </div>
  )
}
