import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Crown, Star, Zap } from 'lucide-react'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import type { BusinessRow } from '@/domain/supabase'
import {
  fetchBusinessSubscription,
  fetchSubscriptionPlans,
  formatPlanPrice,
  parseBusinessFeatures,
  type BusinessFeatureGate,
} from '@/lib/subscriptions'
import { commissionPreview, fetchEffectivePlatformFeePolicy, platformFeePolicy, planFeatures } from '@/lib/monetization'

type PlanChangeRequest = {
  id: string
  current_plan_id: string
  target_plan_id: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  request_note: string | null
  admin_note: string | null
  created_at: string
}

export default function BusinessSubscriptionPanel(props: {
  business: BusinessRow
  isOwner: boolean
  accessToken?: string | null
  onSubscriptionSynced?: () => void
}) {
  const { business, isOwner, onSubscriptionSynced } = props
  const accessToken = props.accessToken ?? null
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestingPlanId, setRequestingPlanId] = useState<string | null>(null)
  const [stripeOpeningPlanId, setStripeOpeningPlanId] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ tone: 'success' | 'warning' | 'info'; text: string } | null>(null)
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null)
  const [requests, setRequests] = useState<PlanChangeRequest[]>([])
  const [feePolicy, setFeePolicy] = useState<ReturnType<typeof platformFeePolicy> | null>(null)
  const [plans, setPlans] = useState<
    Array<{
      id: string
      name: string
      description: string | null
      priceLabel: string
      price_cents: number
      stripe_price_id: string | null
      featuresGate: BusinessFeatureGate
      planFeePolicy: ReturnType<typeof platformFeePolicy> | null
      popular: boolean
      icon: 'star' | 'zap' | 'crown'
      color: string
    }>
  >([])

  const [plansReloadTick, setPlansReloadTick] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [subscription, availablePlans] = await Promise.all([
          fetchBusinessSubscription(business.id),
          fetchSubscriptionPlans('business'),
        ])
        if (!active) return
        setCurrentPlanId(subscription?.plan_id ?? null)
        setPlans(
          availablePlans.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            priceLabel: formatPlanPrice(p.price_cents, p.billing_interval),
            price_cents: p.price_cents,
            stripe_price_id: p.stripe_price_id,
            featuresGate: parseBusinessFeatures(p.features),
            planFeePolicy: (() => {
              const raw = platformFeePolicy(p.features)
              const fallback = platformFeePolicy(planFeatures[p.id] ?? null)
              const eff = raw.source === 'plan' ? raw : fallback
              if (eff.source === 'fallback') return null
              return eff
            })(),
            popular:
              (p.features as Record<string, unknown>)?.highlight_plan === true || p.id === 'business_pro',
            icon: p.id === 'business_ultra' ? 'crown' : p.id === 'business_pro' ? 'zap' : 'star',
            color:
              p.id === 'business_ultra'
                ? 'border-amber-400/30 bg-amber-400/5'
                : p.id === 'business_pro'
                  ? 'border-[#4F7CFF]/50 bg-[#4F7CFF]/10 shadow-[0_0_30px_rgba(79,124,255,0.15)]'
                  : 'border-white/10 bg-white/5',
          })),
        )
      } catch (e: unknown) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Errore caricamento abbonamenti.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [business.id, plansReloadTick])

  useEffect(() => {
    const checkout = searchParams.get('subscriptionCheckout')
    const sessionId = searchParams.get('session_id')
    if (checkout !== 'success' || !sessionId || !accessToken || !isOwner) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/subscriptions/stripe/confirm-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ sessionId, businessId: business.id }),
        })
        const payload = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
        if (cancelled) return
        if (res.ok && payload?.success) {
          setFlash({ tone: 'success', text: 'Piano aggiornato dopo il pagamento.' })
          setPlansReloadTick((x) => x + 1)
          onSubscriptionSynced?.()
        } else {
          setFlash({
            tone: 'warning',
            text: payload?.error ?? 'Impossibile confermare il checkout; riprova o attendi la sincronizzazione.',
          })
        }
      } catch {
        if (!cancelled) {
          setFlash({ tone: 'warning', text: 'Errore rete durante conferma checkout.' })
        }
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams)
          next.delete('subscriptionCheckout')
          next.delete('session_id')
          setSearchParams(next, { replace: true })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    searchParams,
    accessToken,
    isOwner,
    business.id,
    onSubscriptionSynced,
    setSearchParams,
  ])

  useEffect(() => {
    if (!isOwner || !accessToken) return
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/subscriptions/business/change-requests?businessId=${encodeURIComponent(business.id)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const payload = (await res.json().catch(() => null)) as { success?: boolean; rows?: unknown[] } | null
        if (!active || !payload?.success) return
        const rows = Array.isArray(payload.rows) ? payload.rows : []
        const normalized = rows
          .map((x) => {
            const r = x as Record<string, unknown>
            const statusRaw = typeof r.status === 'string' ? r.status : null
            if (
              typeof r.id !== 'string' ||
              typeof r.current_plan_id !== 'string' ||
              typeof r.target_plan_id !== 'string' ||
              (statusRaw !== 'pending' && statusRaw !== 'approved' && statusRaw !== 'rejected' && statusRaw !== 'cancelled') ||
              typeof r.created_at !== 'string'
            ) {
              return null
            }
            return {
              id: r.id,
              current_plan_id: r.current_plan_id,
              target_plan_id: r.target_plan_id,
              status: statusRaw,
              request_note: typeof r.request_note === 'string' ? r.request_note : null,
              admin_note: typeof r.admin_note === 'string' ? r.admin_note : null,
              created_at: r.created_at,
            } as PlanChangeRequest
          })
          .filter((x): x is PlanChangeRequest => Boolean(x))
        setRequests(normalized)
      } catch {
        // Non blocca la vista piano: fallback senza storico richieste.
      }
    })()
    return () => {
      active = false
    }
  }, [accessToken, business.id, isOwner])

  useEffect(() => {
    let active = true
    setFeePolicy(null)
    void fetchEffectivePlatformFeePolicy(business.id)
      .then((p) => {
        if (!active) return
        setFeePolicy(p)
      })
      .catch(() => {
        // non blocca la vista
      })
    return () => {
      active = false
    }
  }, [business.id])

  const planById = useMemo(() => {
    const m = new Map<string, (typeof plans)[number]>()
    for (const p of plans) m.set(p.id, p)
    return m
  }, [plans])

  const currentPlan = currentPlanId ? planById.get(currentPlanId) ?? null : null
  const pendingRequest = requests.find((r) => r.status === 'pending') ?? null

  const renderIcon = (name: 'star' | 'zap' | 'crown') => {
    if (name === 'crown') return <Crown className="h-6 w-6 text-amber-400" />
    if (name === 'zap') return <Zap className="h-6 w-6 text-[#4F7CFF]" />
    return <Star className="h-6 w-6 text-white/50" />
  }

  const gateBullets = (gate: BusinessFeatureGate): string[] => {
    const bullets = [
      gate.maxStaff >= 999 ? 'Staff illimitato' : `Fino a ${gate.maxStaff} membri staff`,
      gate.maxServices >= 999 ? 'Servizi illimitati' : `Fino a ${gate.maxServices} servizi`,
      gate.antiNoShowEnabled ? 'Anti No-Show Engine' : 'Anti No-Show base',
      gate.customDepositsEnabled ? 'Regole caparra avanzate' : 'Regole caparra standard',
    ]
    if (gate.noShowSuite) bullets.push('Suite KPI no-show / ecosistema (baseline vs target)')
    if (gate.resourceManagement) bullets.push('Gestione risorse: tavoli, sale, postazioni')
    if (gate.prioritySupport) bullets.push('Supporto prioritario')
    return bullets
  }

  const requestPlanChange = async (targetPlanId: string) => {
    if (!isOwner || !accessToken || requestingPlanId) return
    setFlash(null)
    setRequestingPlanId(targetPlanId)
    try {
      const res = await fetch('/api/subscriptions/business/request-change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          businessId: business.id,
          targetPlanId,
          note: `Richiesta upgrade da dashboard owner (${currentPlanId ?? 'unknown'} -> ${targetPlanId})`,
        }),
      })
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; request?: PlanChangeRequest }
        | null
      if (!res.ok || !payload?.success) {
        setFlash({ tone: 'warning', text: payload?.error ?? 'Richiesta piano non accettata.' })
        return
      }
      const req = payload.request
      if (req && typeof req.id === 'string') {
        setRequests((prev) => [req, ...prev.filter((x) => x.id !== req.id)])
      }
      setFlash({ tone: 'success', text: 'Richiesta inviata. Il team commerciale la prenderà in carico.' })
    } catch {
      setFlash({ tone: 'warning', text: 'Errore rete durante invio richiesta piano.' })
    } finally {
      setRequestingPlanId(null)
    }
  }

  const startStripeCheckout = async (targetPlanId: string) => {
    if (!isOwner || !accessToken || stripeOpeningPlanId) return
    setFlash(null)
    setStripeOpeningPlanId(targetPlanId)
    try {
      const res = await fetch('/api/subscriptions/business/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ businessId: business.id, targetPlanId }),
      })
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; url?: string; error?: string; code?: string }
        | null
      if (!res.ok || !payload?.success || !payload.url) {
        setFlash({
          tone: 'warning',
          text: payload?.error ?? `Checkout non disponibile (${res.status}).`,
        })
        return
      }
      window.location.href = payload.url
    } catch {
      setFlash({ tone: 'warning', text: 'Errore rete durante avvio checkout Stripe.' })
    } finally {
      setStripeOpeningPlanId(null)
    }
  }

  return (
    <Card padded={false} className="p-5 md:p-8">
      <div className="tb-kicker">PIANI E ABBONAMENTO</div>
      <div className="mt-1 text-xl font-bold text-white">Gestione piano attività</div>
      <div className="mt-2 text-sm text-white/60">
        Catalogo piani (FREE / PRO / ULTRA). I limiti staff e servizi sono applicati nella dashboard; qui puoi richiedere un cambio piano
        al team. Non viene addebitato nulla dall&apos;app finché non colleghi un PSP (Stripe, Mollie, ecc.) con checkout attivo.
      </div>

      {loading ? <Alert tone="info" className="mt-6">Caricamento piani in corso…</Alert> : null}
      {error ? <Alert tone="danger" className="mt-6">{error}</Alert> : null}
      {!loading && !error && !currentPlan ? (
        <Alert tone="warning" className="mt-6">
          Nessun piano associato all’attività. Assegna almeno il piano Starter dal backoffice.
        </Alert>
      ) : null}
      {!loading && !error && currentPlan ? (
        <Alert tone="success" className="mt-6">
          Piano attuale: <span className="font-semibold">{currentPlan.name}</span>.
        </Alert>
      ) : null}
      {feePolicy ? (
        <Alert tone="info" className="mt-4">
          Commissione piattaforma attuale:{' '}
          <span className="font-semibold">
            {feePolicy.percentMin === feePolicy.percentMax
              ? `${feePolicy.percentDefault.toFixed(2)}%`
              : `${feePolicy.percentMin.toFixed(2)}–${feePolicy.percentMax.toFixed(2)}%`}
          </span>{' '}
          (sorgente: {feePolicy.source}).
        </Alert>
      ) : null}
      {pendingRequest ? (
        <Alert tone="info" className="mt-4">
          Richiesta in lavorazione verso piano <span className="font-semibold">{pendingRequest.target_plan_id}</span>.
        </Alert>
      ) : null}
      {flash ? <Alert tone={flash.tone} className="mt-4">{flash.text}</Alert> : null}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {plans.map((p) => {
          const isActive = currentPlanId === p.id
          const busySubmit = requestingPlanId !== null || stripeOpeningPlanId !== null
          const actionDisabled = !isOwner || Boolean(pendingRequest) || busySubmit
          const stripeEligible =
            isOwner &&
            Boolean(accessToken) &&
            p.price_cents > 0 &&
            Boolean(p.stripe_price_id?.trim()) &&
            !pendingRequest &&
            !isActive
          const sample = p.planFeePolicy ? commissionPreview(100_00, p.planFeePolicy) : null
          return (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-3xl border p-6 transition-transform hover:-translate-y-1 ${p.color}`}
            >
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#4F7CFF] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  Più scelto
                </div>
              )}
              
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
                {renderIcon(p.icon)}
              </div>
              
              <div className="text-xl font-bold text-white">{p.name}</div>
              <div className="mt-2 min-h-[40px] text-sm text-white/70">{p.description ?? 'Piano operativo TrustBook.'}</div>
              
              <div className="my-6 text-3xl font-extrabold text-white">
                {p.priceLabel}
              </div>

              {p.planFeePolicy ? (
                <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                  {p.planFeePolicy.percentMin === p.planFeePolicy.percentMax
                    ? `Commissione ${p.planFeePolicy.percentDefault.toFixed(2)}%`
                    : `Commissione ${p.planFeePolicy.percentMin.toFixed(2)}–${p.planFeePolicy.percentMax.toFixed(2)}%`}
                  {sample ? (
                    <span className="ml-2 text-white/50">
                      (esempio su 100€: {Math.round(sample.platformFeeCents / 100)}€)
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex-1 space-y-3">
                {gateBullets(p.featuresGate).map((f, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="text-sm text-white/80">{f}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-2">
                {isActive ? (
                  <Button variant="secondary" className="w-full cursor-default border-white/20 text-white/50" disabled>
                    Piano attuale
                  </Button>
                ) : (
                  <>
                    {stripeEligible ? (
                      <Button
                        variant="primary"
                        className="w-full"
                        disabled={actionDisabled}
                        onClick={() => startStripeCheckout(p.id)}
                      >
                        {stripeOpeningPlanId === p.id ? 'Reindirizzamento a Stripe…' : 'Checkout Stripe (abbonamento)'}
                      </Button>
                    ) : null}
                    <Button
                      variant={stripeEligible ? 'secondary' : p.popular ? 'primary' : 'secondary'}
                      className="w-full"
                      disabled={actionDisabled}
                      onClick={() => requestPlanChange(p.id)}
                    >
                      {!isOwner
                        ? 'Solo owner'
                        : requestingPlanId === p.id
                          ? 'Invio richiesta…'
                          : pendingRequest
                            ? 'Richiesta già aperta'
                            : stripeEligible
                              ? 'Preferisco richiesta manuale'
                              : 'Richiedi attivazione piano'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
        <div className="text-sm font-semibold text-white">Pagamenti PSP (Stripe / Mollie)</div>
        <div className="mt-1 text-xs text-white/60">
          Le richieste di cambio piano restano tracciate anche senza checkout automatico: il team può approvare e aggiornare il piano nel database,
          oppure completare il billing quando Checkout + webhook di Stripe o Mollie saranno configurati sul progetto.
        </div>
      </div>
    </Card>
  )
}
