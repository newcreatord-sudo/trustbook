import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCircle2 } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/authContext'
import { errorMessage } from '@/lib/errors'
import type { NotificationRow } from '@/domain/supabase'
import { formatDateTime } from '@/utils/time'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'
import { cn } from '@/lib/utils'
import { safeParseNotificationRow, safeParseUserPreferencesRow } from '@/domain/parse'
import { defaultUserPreferences, prefsFromRow, shouldShowNotification, type UserPreferences } from '@/lib/userPreferences'

function sortNotifications(rows: NotificationRow[]) {
  return [...rows].sort((a, b) => {
    const aKey = a.deliver_at ?? a.created_at
    const bKey = b.deliver_at ?? b.created_at
    const aTime = new Date(aKey).getTime()
    const bTime = new Date(bKey).getTime()
    return bTime - aTime
  })
}

export default function Notifications() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState<UserPreferences>({ ...defaultUserPreferences })

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      setRows([])
      return
    }
    let mounted = true
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const nowIso = new Date().toISOString()
        const [nRes, pRes] = await Promise.all([
          supabase
            .from('notifications')
            .select('*')
            .eq('recipient_user_id', userId)
            .or(`deliver_at.is.null,deliver_at.lte.${nowIso}`)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
        ])
        if (!mounted) return
        if (nRes.error) throw nRes.error
        if (pRes.error) throw pRes.error
        setRows(
          sortNotifications(
            ((((nRes.data as unknown[]) ?? []) as unknown[]).map((x) => safeParseNotificationRow(x)).filter(Boolean) as NotificationRow[]) ??
              [],
          ),
        )
        setPrefs(prefsFromRow(pRes.data ? safeParseUserPreferencesRow(pRes.data) : null))
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento notifiche.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    const ch = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_user_id=eq.${userId}` },
        () => {
          void (async () => {
            const nowIso = new Date().toISOString()
            const { data } = await supabase
              .from('notifications')
              .select('*')
              .eq('recipient_user_id', userId)
              .or(`deliver_at.is.null,deliver_at.lte.${nowIso}`)
              .order('created_at', { ascending: false })
              .limit(50)
            if (!mounted) return
            setRows(
              sortNotifications(
                ((((data as unknown[]) ?? []) as unknown[]).map((x) => safeParseNotificationRow(x)).filter(Boolean) as NotificationRow[]) ?? [],
              ),
            )
          })()
        },
      )
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(ch)
    }
  }, [userId])

  const visibleRows = useMemo(() => rows.filter((r) => shouldShowNotification(r.kind, prefs)), [prefs, rows])
  const visibleUnread = useMemo(() => visibleRows.filter((r) => !r.read_at).length, [visibleRows])

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <Card className="border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-2xl md:p-8" padded={false}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Centro Notifiche</h1>
              <p className="mt-1 text-sm font-medium text-white/60">Aggiornamenti su prenotazioni, caparre e messaggi chat.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
              disabled={busy || visibleUnread === 0}
              onClick={() => {
                if (!userId) return
                setBusy(true)
                ;(async () => {
                  try {
                    const nowIso = new Date().toISOString()
                    const { error } = await supabase
                      .from('notifications')
                      .update({ read_at: new Date().toISOString() })
                      .eq('recipient_user_id', userId)
                      .is('read_at', null)
                      .or(`deliver_at.is.null,deliver_at.lte.${nowIso}`)
                    if (error) throw error
                  } catch (e: unknown) {
                    setError(errorMessage(e, 'Errore aggiornamento notifiche.'))
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              Segna tutto come letto
            </Button>
          </div>

          {!prefs.channelInApp ? (
            <Alert className="mt-6" tone="info">
              Hai disattivato le notifiche in-app. Qui vedi comunque lo storico.{' '}
              <Link className="font-bold underline underline-offset-4 text-white" to="/impostazioni">
                Gestisci preferenze
              </Link>
            </Alert>
          ) : null}

          {error && (
            <Alert className="mt-6" tone="danger">
              {error}
            </Alert>
          )}

          <div className="mt-8 space-y-3">
            {loading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="h-24 w-full animate-pulse rounded-2xl bg-white/5" />
              ))
            ) : visibleRows.length === 0 ? (
              <EmptyState
                icon={<Bell className="h-8 w-8 text-white/40" />}
                title="Nessuna notifica"
                description="Sei aggiornato su tutto. Potresti avere filtri attivi nelle preferenze."
                action={
                  <Link to="/impostazioni">
                    <Button type="button" variant="secondary">
                      Gestisci preferenze
                    </Button>
                  </Link>
                }
              />
            ) : (
              visibleRows.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'group flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between rounded-2xl border p-5 transition-all',
                    n.read_at 
                      ? 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]' 
                      : 'border-[#4F7CFF]/30 bg-[#4F7CFF]/5 hover:bg-[#4F7CFF]/10 shadow-lg shadow-[#4F7CFF]/5',
                  )}
                >
                  <div className="flex items-start gap-4">
                    {!n.read_at && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4F7CFF] shadow-[0_0_8px_rgba(79,124,255,0.8)]" />
                    )}
                    <div>
                      <div className={cn("text-base font-bold", n.read_at ? "text-white/80" : "text-white")}>{n.title}</div>
                      {n.body && <div className="mt-1 text-sm leading-relaxed text-white/60">{n.body}</div>}
                      <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white/40">
                        {formatDateTime(n.deliver_at ?? n.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 flex-row gap-2 sm:w-auto sm:flex-col items-end">
                    {n.link && (
                      <Link to={n.link} className="w-full sm:w-auto">
                        <Button type="button" variant="secondary" size="sm" className="w-full">
                          Apri
                        </Button>
                      </Link>
                    )}
                    {!n.read_at && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full sm:w-auto opacity-50 hover:opacity-100"
                        disabled={busy || Boolean(n.read_at)}
                        onClick={() => {
                          if (!userId) return
                          if (n.read_at) return
                          setBusy(true)
                          ;(async () => {
                            try {
                              const { error } = await supabase
                                .from('notifications')
                                .update({ read_at: new Date().toISOString() })
                                .eq('id', n.id)
                                .eq('recipient_user_id', userId)
                              if (error) throw error
                            } catch (e: unknown) {
                              setError(errorMessage(e, 'Errore aggiornamento.'))
                            } finally {
                              setBusy(false)
                            }
                          })()
                        }}
                      >
                        Letta
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
