import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BusinessRow } from '@/domain/supabase'
import Card from '@/shared/ui/Card'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'
import MediaThumb from '@/shared/ui/MediaThumb'
import { formatMoneyEUR } from '@/utils/time'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { fetchBusinessLiveOverview, type BusinessLiveOverviewRow } from '@/lib/businessLiveOverviewApi'

export default function MultiBusinessOverviewPanel(props: {
  businesses: BusinessRow[]
  onOpenBusiness: (businessId: string) => void
}) {
  const [rows, setRows] = useState<BusinessLiveOverviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  const portfolioBusinesses = useMemo(() => {
    return [...props.businesses].sort((a, b) => a.id.localeCompare(b.id))
  }, [props.businesses])

  const sortedBusinesses = useMemo(() => {
    return [...props.businesses].sort((a, b) => a.name.localeCompare(b.name))
  }, [props.businesses])

  const businessIdsKey = useMemo(() => {
    return portfolioBusinesses.map((b) => b.id).join('|')
  }, [portfolioBusinesses])

  const byId = useMemo(() => {
    const map = new Map<string, BusinessLiveOverviewRow>()
    for (const r of rows) map.set(r.business_id, r)
    return map
  }, [rows])

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await fetchBusinessLiveOverview({ at: new Date().toISOString() })
      setRows(data)
    } catch (e: unknown) {
      setRows([])
      setErr(errorMessage(e, 'Impossibile caricare la panoramica multi-attività.'))
    } finally {
      setLoading(false)
    }
  }, [])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void refresh()
    }, 700)
  }, [refresh])

  useEffect(() => {
    void refresh()
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    }
  }, [businessIdsKey, refresh])

  useEffect(() => {
    if (portfolioBusinesses.length === 0) return
    if (portfolioBusinesses.length > 25) return
    const channels = portfolioBusinesses.map((b) =>
      supabase
        .channel(`portfolio_bookings:${b.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings', filter: `business_id=eq.${b.id}` },
          () => scheduleRefresh(),
        )
        .subscribe(),
    )
    return () => {
      for (const ch of channels) void supabase.removeChannel(ch)
    }
  }, [businessIdsKey, portfolioBusinesses, scheduleRefresh])

  useEffect(() => {
    if (!businessIdsKey) return
    const base = portfolioBusinesses.length > 25 ? 8000 : 30000
    const id = window.setInterval(() => {
      void refresh()
    }, base)
    return () => window.clearInterval(id)
  }, [businessIdsKey, portfolioBusinesses.length, refresh])

  const totals = useMemo(() => {
    const t = {
      pending: 0,
      today: 0,
      upcoming: 0,
      occupied: 0,
      resources: 0,
      estRevenueCents: 0,
    }
    for (const r of rows) {
      t.pending += r.pending_pipeline_count
      t.today += r.today_active_count
      t.upcoming += r.upcoming_7_active_count
      t.occupied += r.occupied_resource_count
      t.resources += r.total_active_resources
      t.estRevenueCents += r.estimated_revenue_today_cents
    }
    return t
  }, [rows])

  return (
    <Card padded={false} className="p-5 border-white/10 bg-white/[0.02]">
      <div className="tb-kicker">CONTROLLO MULTI-ATTIVITÀ</div>
      <div className="mt-1 text-sm font-semibold text-white">Tutte le attività in tempo quasi reale</div>
      <div className="mt-2 text-xs text-white/60">
        Occupazione sala/postazioni e KPI principali. Aggiornamento automatico quando cambiano le prenotazioni.
      </div>

      {err ? <Alert tone="danger" className="mt-4">{err}</Alert> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Aggiorno…' : 'Aggiorna ora'}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-white/55">
          <span>In sospeso: <span className="text-white/80 font-semibold">{totals.pending}</span></span>
          <span>Oggi: <span className="text-white/80 font-semibold">{totals.today}</span></span>
          <span>7 giorni: <span className="text-white/80 font-semibold">{totals.upcoming}</span></span>
          <span>Occupati: <span className="text-white/80 font-semibold">{totals.occupied}/{totals.resources}</span></span>
          <span>Ricavo stimato oggi: <span className="text-white/80 font-semibold">{formatMoneyEUR(totals.estRevenueCents)}</span></span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedBusinesses.map((b) => {
          const r = byId.get(b.id) ?? null
          const showDen = r?.last30_show_denominator ?? 0
          const noShowPct =
            r && showDen > 0 ? Math.round((r.last30_no_show / showDen) * 1000) / 10 : null
          const occ = r ? `${r.occupied_resource_count}/${r.total_active_resources}` : '—'
          const rating =
            r && typeof r.avg_rating_last30 === 'number'
              ? `${Math.round(r.avg_rating_last30 * 10) / 10}/5`
              : '—'
          return (
            <div key={b.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <MediaThumb
                  src={b.logo_url}
                  alt={`Logo ${b.name}`}
                  fallbackLabel={b.name}
                  roundedClassName="!rounded-xl"
                  containerClassName="h-11 w-11 shrink-0 text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{b.name}</div>
                  <div className="truncate text-xs text-white/50">{b.category} · {b.city ?? '—'}</div>
                </div>
                <div className="shrink-0">
                  <Button size="sm" variant="primary" onClick={() => props.onOpenBusiness(b.id)}>
                    Apri
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <div className="text-white/50">Occupazione</div>
                  <div className="mt-0.5 font-semibold text-white/90">{occ}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <div className="text-white/50">Ricavo stimato oggi</div>
                  <div className="mt-0.5 font-semibold text-white/90">
                    {r ? formatMoneyEUR(r.estimated_revenue_today_cents) : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <div className="text-white/50">Oggi / 7 giorni</div>
                  <div className="mt-0.5 font-semibold text-white/90">
                    {r ? `${r.today_active_count} / ${r.upcoming_7_active_count}` : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <div className="text-white/50">Soddisfazione (30g)</div>
                  <div className="mt-0.5 font-semibold text-white/90">
                    {rating}{r && r.reviews_last30 ? ` · ${r.reviews_last30}` : ''}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/55">
                <span>Pending: <span className="text-white/80 font-semibold">{r ? r.pending_pipeline_count : '—'}</span></span>
                <span>No-show 30g: <span className="text-white/80 font-semibold">{noShowPct !== null ? `${noShowPct}%` : '—'}</span></span>
                <span>Caparre trattenute 30g: <span className="text-white/80 font-semibold">{r ? formatMoneyEUR(r.last30_forfeited_deposit_cents) : '—'}</span></span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
