import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Sparkles } from 'lucide-react'
import Card from '@/shared/ui/Card'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'
import { useAuth } from '@/providers/authContext'
import { fetchCustomerSubscription, fetchSubscriptionPlans, formatPlanPrice, parseCustomerFeatures } from '@/lib/subscriptions'

export default function CustomerSubscriptionPanel() {
  const { session } = useAuth()
  const customerId = session?.user?.id ?? null
  const accessToken = session?.access_token ?? null
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null)
  const [stripeOpeningPlanId, setStripeOpeningPlanId] = useState<string | null>(null)
  const [plans, setPlans] = useState<
    Array<{ id: string; name: string; priceLabel: string; price_cents: number; stripe_price_id: string | null; bullets: string[] }>
  >([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)

  const [plansReloadTick, setPlansReloadTick] = useState(0)
  const [postCheckoutFlash, setPostCheckoutFlash] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)

  useEffect(() => {
    if (!customerId) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [subscription, plans] = await Promise.all([fetchCustomerSubscription(customerId), fetchSubscriptionPlans('customer')])
        if (!active) return
        setActivePlanId(subscription?.plan_id ?? null)
        const selected = plans.map((p) => {
          const gate = parseCustomerFeatures(p.features)
          const bullets = [
            gate.priorityBooking ? 'Priorità di prenotazione dove previsto dagli operatori' : 'Prenotazione standard',
            gate.noDepositRequired
              ? 'Caparra ridotta/azzerata dove previsto dal piano e dall’attività'
              : 'Condizioni caparra secondo regole dell’attività',
            gate.advancedReminders ? 'Promemoria avanzati' : 'Promemoria standard',
            gate.perks ? 'Accesso a vantaggi/coupon quando disponibili' : 'Nessun vantaggio extra incluso nel piano',
            gate.reputationBoost ? 'Profilo affidabilità valorizzato dove previsto' : 'Profilo affidabilità standard',
          ]
          return {
            id: p.id,
            name: p.name,
            priceLabel: formatPlanPrice(p.price_cents, p.billing_interval),
            price_cents: p.price_cents,
            stripe_price_id: p.stripe_price_id,
            bullets,
          }
        })
        setPlans(selected)
      } catch (e: unknown) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Errore caricamento piano cliente.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [customerId, plansReloadTick])

  useEffect(() => {
    const checkout = searchParams.get('subscriptionCheckout')
    const sessionId = searchParams.get('session_id')
    if (checkout !== 'success' || !sessionId || !accessToken || !customerId) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/subscriptions/stripe/confirm-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ sessionId }),
        })
        const payload = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
        if (cancelled) return
        if (res.ok && payload?.success) {
          setPostCheckoutFlash({ tone: 'success', text: 'Piano aggiornato dopo il pagamento.' })
          setPlansReloadTick((x) => x + 1)
        } else {
          setPostCheckoutFlash({
            tone: 'warning',
            text: payload?.error ?? 'Impossibile confermare il checkout; riprova o attendi la sincronizzazione.',
          })
        }
      } catch {
        if (!cancelled) {
          setPostCheckoutFlash({ tone: 'warning', text: 'Errore rete durante conferma checkout.' })
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
  }, [searchParams, accessToken, customerId, setSearchParams])

  const startStripeCheckout = async (targetPlanId: string) => {
    if (!customerId || !accessToken || stripeOpeningPlanId) return
    setCheckoutErr(null)
    setStripeOpeningPlanId(targetPlanId)
    try {
      const res = await fetch('/api/subscriptions/customer/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ targetPlanId }),
      })
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; url?: string; error?: string }
        | null
      if (!res.ok || !payload?.success || !payload.url) {
        setCheckoutErr(payload?.error ?? `Checkout non disponibile (${res.status}).`)
        return
      }
      window.location.href = payload.url
    } catch {
      setCheckoutErr('Errore rete durante avvio checkout Stripe.')
    } finally {
      setStripeOpeningPlanId(null)
    }
  }

  const active = useMemo(() => plans.find((p) => p.id === activePlanId) ?? null, [activePlanId, plans])

  return (
    <Card padded={false} className="p-6 border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent shadow-xl">
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#4F7CFF]">
        <Sparkles className="h-4 w-4" />
        Piano cliente
      </div>
      <div className="mt-2 text-xs text-white/70">
        Piani cliente attivi nel catalogo (FREE / PLUS, ecc.). Non viene addebitato nulla dall&apos;app finché non colleghi checkout PSP (Stripe,
        Mollie, ecc.).
      </div>

      {loading ? (
        <Alert tone="info" className="mt-4">
          Caricamento piano cliente…
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}
      {checkoutErr ? (
        <Alert tone="warning" className="mt-4">
          {checkoutErr}
        </Alert>
      ) : null}
      {postCheckoutFlash ? (
        <Alert tone={postCheckoutFlash.tone === 'success' ? 'success' : 'warning'} className="mt-4">
          {postCheckoutFlash.text}
        </Alert>
      ) : null}
      {!loading && !error && plans.length === 0 ? (
        <Alert tone="warning" className="mt-4">
          Nessun piano cliente disponibile.
        </Alert>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {plans.map((p) => {
          const isActive = activePlanId === p.id || (!activePlanId && p.id === 'customer_free')
          const stripeEligible =
            Boolean(customerId && accessToken) &&
            !isActive &&
            p.price_cents > 0 &&
            Boolean(p.stripe_price_id?.trim())
          const busyStripe = stripeOpeningPlanId !== null
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-4 ${isActive ? 'border-[#4F7CFF]/50 bg-[#4F7CFF]/10' : 'border-white/10 bg-white/5'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">{p.name}</div>
                  <div className="mt-1 text-xs text-white/60">{p.priceLabel}</div>
                </div>
                {isActive ? (
                  <div className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/80">Attivo</div>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {p.bullets.map((b) => (
                  <div key={b} className="flex items-start gap-2 text-xs text-white/80">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    {b}
                  </div>
                ))}
              </div>
              {stripeEligible ? (
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  disabled={busyStripe}
                  onClick={() => startStripeCheckout(p.id)}
                >
                  {stripeOpeningPlanId === p.id ? 'Reindirizzamento a Stripe…' : 'Checkout Stripe (abbonamento)'}
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs text-white/70">
          Piano attivo: <span className="font-semibold text-white/90">{active?.name ?? 'FREE'}</span>
        </div>
        <Link to="/impostazioni" className="tb-btn tb-btn-secondary inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold">
          Preferenze e contatti
        </Link>
      </div>
    </Card>
  )
}
