import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Card from '@/shared/ui/Card'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'
import Button from '@/shared/ui/Button'

export type ListToolbarSortOption = { value: string; label: string; disabled?: boolean }

export default function ListToolbar(props: {
  title: string
  subtitle?: string
  query: string
  onQueryChange: (next: string) => void
  queryPlaceholder?: string
  sort?: {
    label?: string
    value: string
    options: ListToolbarSortOption[]
    onChange: (next: string) => void
  }
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  onReset?: () => void
  busy?: boolean
  className?: string
}) {
  return (
    <Card padded={false} className={cn('p-4 md:p-5', props.className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{props.title}</div>
          {props.subtitle ? <div className="mt-1 text-xs text-white/70">{props.subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          {props.secondaryAction}
          {props.primaryAction}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-12">
        <div className="relative md:col-span-6">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/60">
            <Search className="h-4 w-4" />
          </div>
          <Input
            value={props.query}
            onChange={(e) => props.onQueryChange(e.target.value)}
            placeholder={props.queryPlaceholder ?? 'Cerca…'}
            className="pl-10 pr-10"
            disabled={props.busy}
          />
          {props.query.trim() ? (
            <button
              type="button"
              onClick={() => props.onQueryChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Cancella ricerca"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {props.sort ? (
          <div className="md:col-span-4">
            <div className="sr-only">{props.sort.label ?? 'Ordinamento'}</div>
            <Select value={props.sort.value} onChange={(e) => props.sort?.onChange(e.target.value)} disabled={props.busy}>
              {props.sort.options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="hidden md:col-span-4 md:block" />
        )}

        <div className="md:col-span-2 md:flex md:justify-end">
          {props.onReset ? (
            <Button type="button" variant="secondary" size="sm" onClick={props.onReset} disabled={props.busy} className="w-full md:w-auto">
              Reset
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

