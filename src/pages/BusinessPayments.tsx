import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Euro, RefreshCcw } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { useAuth } from '@/providers/authContext'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatMoneyEUR } from '@/utils/time'
import type { BookingPaymentRow, BusinessRow } from '@/domain/supabase'
import { supabase } from '@/lib/supabase'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Select from '@/shared/ui/Select'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'
import Badge from '@/shared/ui/Badge'

type ApiRow = BookingPaymentRow & {
  booking: {
    id: string
    start_at: string
    end_at: string
    service_name: string | null
    customer: { first_name: string | null; last_name: string | null; phone: string | null } | null
  } | null
}

export default function BusinessPayments() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const accessToken = session?.access_token ?? null

  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null)
  const [rows, setRows] = useState<ApiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadBusinesses = async () => {
    if (!userId) return
    const [ownedRes, memberRes] = await Promise.all([
      supabase.from('businesses').select('*').eq('owner_user_id', userId).order('created_at', { ascending: false }),
      supabase.from('team_members').select('business_id').eq('user_id', userId),
    ])
    if (ownedRes.error) throw ownedRes.error
    if (memberRes.error) throw memberRes.error
    const owned = (ownedRes.data as BusinessRow[]) ?? []
    const memberBusinessIds = Array.from(
      new Set(
        ((memberRes.data as Array<{ business_id: string }>) ?? [])
          .map((x) => x.business_id)
          .filter(Boolean),
      ),
    )
    let memberBusinesses: BusinessRow[] = []
    if (memberBusinessIds.length) {
      const { data: mb, error: mbErr } = await supabase.from('businesses').select('*').in('id', memberBusinessIds)
      if (mbErr) throw mbErr
      memberBusinesses = (mb as BusinessRow[]) ?? []
    }
    const mergedMap = new Map<string, BusinessRow>()
    for (const b of [...owned, ...memberBusinesses]) mergedMap.set(b.id, b)
    const list = Array.from(mergedMap.values()).sort((a, b) => b.created_at.localeCompare(a.created_at))
    setBusinesses(list)
    setActiveBusinessId((prev) => {
      if (prev && list.some((b) => b.id === prev)) return prev
      return list[0]?.id ?? null
    })
  }

  const loadPayments = async (businessId: string) => {
    if (!accessToken) throw new Error('Sessione non valida')
    const res = await fetch(`/api/stripe/business/payments?businessId=${encodeURIComponent(businessId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const json = (await res.json()) as { success: boolean; rows?: ApiRow[]; error?: string }
    if (!res.ok || !json.success) throw new Error(json.error || 'Errore caricamento pagamenti')
    setRows(json.rows ?? [])
  }

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      setBusinesses([])
      setActiveBusinessId(null)
      setRows([])
      return
    }
    setError(null)
    setLoading(true)
    let mounted = true
    ;(async () => {
      try {
        await loadBusinesses()
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento attività.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!activeBusinessId) {
      setBusy(false)
      setRows([])
      return
    }
    setError(null)
    setBusy(true)
    let mounted = true
    ;(async () => {
      try {
        await loadPayments(activeBusinessId)
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento pagamenti.'))
      } finally {
        if (mounted) setBusy(false)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId])

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.status === 'paid').reduce((a, r) => a + (r.amount_cents ?? 0), 0)
    const refunded = rows.filter((r) => r.status === 'refunded').reduce((a, r) => a + (r.amount_cents ?? 0), 0)
    const forfeited = rows.filter((r) => r.status === 'forfeited').reduce((a, r) => a + (r.amount_cents ?? 0), 0)
    return { paid, refunded, forfeited }
  }, [rows])

  return (
    <AppShell>
      <Card className="p-5" padded={false}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Pagamenti</div>
            <div className="mt-1 text-xs text-white/70">Caparre: pagate, rimborsate o trattenute.</div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={activeBusinessId ?? ''}
              onChange={(e) => setActiveBusinessId(e.target.value)}
              disabled={loading || businesses.length <= 1}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCcw className="h-4 w-4" />}
              disabled={busy || !activeBusinessId}
              onClick={() => {
                if (!activeBusinessId) return
                setBusy(true)
                setError(null)
                ;(async () => {
                  try {
                    await loadPayments(activeBusinessId)
                  } catch (e: unknown) {
                    setError(errorMessage(e, 'Errore refresh.'))
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              Aggiorna
            </Button>
          </div>
        </div>

        {error && <Alert className="mt-4" tone="danger">{error}</Alert>}

        {activeBusinessId ? (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold text-white/60">PAGATE</div>
            <div className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Euro className="h-4 w-4 text-white/60" />
              {formatMoneyEUR(totals.paid)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold text-white/60">RIMBORSATE</div>
            <div className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Euro className="h-4 w-4 text-white/60" />
              {formatMoneyEUR(totals.refunded)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold text-white/60">TRATTENUTE</div>
            <div className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Euro className="h-4 w-4 text-white/60" />
              {formatMoneyEUR(totals.forfeited)}
            </div>
          </div>
        </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">Caricamento…</div>
          ) : !activeBusinessId ? (
            <EmptyState
              icon={<CreditCard className="h-5 w-5 text-white/60" />}
              title="Pagamenti riservati all’owner"
              description="Questa pagina mostra solo le attività di cui sei titolare. Se sei solo staff, chiedi riepiloghi pagamenti all’intestatario."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-5 w-5 text-white/60" />}
              title="Nessuna caparra"
              description="Quando un cliente paga una caparra, la vedrai qui."
            />
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Caparra {formatMoneyEUR(r.amount_cents)}</div>
                    <div className="mt-1 text-xs text-white/70">
                      {r.booking?.service_name ? `${r.booking.service_name} · ` : ''}
                      {r.booking ? formatDateTime(r.booking.start_at) : formatDateTime(r.created_at)}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {(() => {
                        const c = r.booking?.customer
                        const name = [c?.first_name, c?.last_name].filter(Boolean).join(' ')
                        const phone = c?.phone ? ` · ${c.phone}` : ''
                        if (name) return `${name}${phone}`
                        return `Booking ${r.booking_id}`
                      })()}
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <Badge
                      tone={
                        r.status === 'paid'
                          ? 'success'
                          : r.status === 'refunded'
                            ? 'neutral'
                            : r.status === 'forfeited'
                              ? 'warning'
                              : 'info'
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </AppShell>
  )
}
