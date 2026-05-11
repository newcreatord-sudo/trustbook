import { useEffect, useState } from 'react'
import { Bell, BellOff, ShieldAlert } from 'lucide-react'
import Button from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/toastContext'
import {
  checkPushSupport,
  subscribeToPush,
  unsubscribeFromPush,
  type SubscribeResult,
} from '@/lib/pushClient'

/**
 * Settings widget that lets a user opt-in/out of native browser push.
 *
 *  - Shows the current state (subscribed / not subscribed / unsupported).
 *  - Disables the action when the VAPID public key is not configured at build
 *    time (so we don't show a button that will always fail).
 *  - Each error reason is translated to an actionable Italian message.
 */
export default function PushNotificationsToggle() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const { push: pushToast } = useToast()
  const support = checkPushSupport()
  const hasVapid = Boolean(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!support.supported) {
        if (!cancelled) setSubscribed(false)
        return
      }
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!cancelled) setSubscribed(!!sub)
      } catch {
        if (!cancelled) setSubscribed(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [support.supported])

  const explain = (r: SubscribeResult): string => {
    if (r.ok === true) return 'Notifiche push attivate.'
    switch (r.reason) {
      case 'unsupported':
        return 'Il tuo browser non supporta le notifiche push.'
      case 'permission-denied':
        return 'Hai negato il permesso. Riabilitalo dalle impostazioni del browser.'
      case 'no-vapid':
        return 'Configurazione mancante (VAPID). Contatta il supporto.'
      case 'no-session':
        return 'Sessione scaduta: rieffettua il login.'
      case 'server-error':
        return `Errore nel salvataggio (${r.detail ?? 'unknown'}).`
      default:
        return 'Errore sconosciuto.'
    }
  }

  const onEnable = async () => {
    setBusy(true)
    try {
      const r = await subscribeToPush()
      pushToast({
        tone: r.ok ? 'success' : 'danger',
        title: r.ok ? 'Notifiche push' : 'Non posso attivare',
        description: explain(r),
      })
      if (r.ok) setSubscribed(true)
    } finally {
      setBusy(false)
    }
  }

  const onDisable = async () => {
    setBusy(true)
    try {
      await unsubscribeFromPush()
      pushToast({ tone: 'info', title: 'Notifiche push', description: 'Disattivate su questo dispositivo.' })
      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }

  if (!support.supported) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">
        <ShieldAlert className="h-5 w-5 text-amber-300" aria-hidden />
        <div>Le notifiche push non sono disponibili su questo browser.</div>
      </div>
    )
  }

  if (!hasVapid) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">
        <ShieldAlert className="h-5 w-5 text-amber-300" aria-hidden />
        <div>
          Notifiche push non configurate. Imposta <code className="font-mono text-xs">VITE_WEB_PUSH_VAPID_PUBLIC_KEY</code>.
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex min-w-0 items-center gap-3">
        {subscribed ? <Bell className="h-5 w-5 text-emerald-300" aria-hidden /> : <BellOff className="h-5 w-5 text-white/55" aria-hidden />}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">Notifiche push</div>
          <div className="text-xs text-white/60">
            {subscribed === null
              ? 'Caricamento stato…'
              : subscribed
              ? 'Attive su questo dispositivo. Riceverai promemoria e aggiornamenti anche a app chiusa.'
              : 'Non ancora attivate. Attivale per non perdere promemoria e conferme.'}
          </div>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant={subscribed ? 'secondary' : 'primary'}
        loading={busy}
        onClick={subscribed ? onDisable : onEnable}
      >
        {subscribed ? 'Disattiva' : 'Attiva'}
      </Button>
    </div>
  )
}
