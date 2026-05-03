import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, ChevronRight, Info, Save, Shield, Star, User } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { errorMessage } from '@/lib/errors'
import { customerRiskPresentation, getRiskLevel } from '@/domain/antiNoShowEngine'
import { computeEffectiveReliability, tierFromStars } from '@/utils/reliability'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/authContext'
import type { ProfileRow } from '@/domain/supabase'
import { formatDateTime } from '@/utils/time'
import Alert from '@/shared/ui/Alert'
import Avatar from '@/shared/ui/Avatar'
import Badge from '@/shared/ui/Badge'
import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'
import EmptyState from '@/shared/ui/EmptyState'
import Input from '@/shared/ui/Input'
import Skeleton from '@/shared/ui/Skeleton'
import { safeParseUserPreferencesRow } from '@/domain/parse'
import { defaultUserPreferences, prefsFromRow, type UserPreferences } from '@/lib/userPreferences'
import CustomerSubscriptionPanel from '@/pages/dashboard/CustomerSubscriptionPanel'
import ReviewReportModal from '@/components/ReviewReportModal'
import { useToast } from '@/shared/ui/toastContext'

export default function Profile() {
  const { session, profile, refreshProfile } = useAuth()
  const { push } = useToast()
  const userId = session?.user?.id ?? null

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  const [reliability, setReliability] = useState<{
    score: number
    stars: number
    completedCount: number
    lateCancelCount: number
    noShowCount: number
    totalBookings: number
    normalCancelCount: number
    rejectedRequestsCount: number
    lostDepositsCount: number
  } | null>(null)
  const [events, setEvents] = useState<Array<{ kind: string; delta: number; createdAt: string }>>([])
  const [prefs, setPrefs] = useState<UserPreferences>({ ...defaultUserPreferences })

  const effective = useMemo(
    () =>
      computeEffectiveReliability({
        baseScore: reliability?.score ?? 80,
        stars: reliability?.stars ?? 0,
        noShowCount: reliability?.noShowCount ?? 0,
        lateCancelCount: reliability?.lateCancelCount ?? 0,
      }),
    [reliability],
  )
  const effectiveRisk = getRiskLevel(effective.effectiveScore)
  const trustBadge = customerRiskPresentation(effectiveRisk)

  const [receivedReviews, setReceivedReviews] = useState<
    Array<{ id: string; rating: number; comment: string | null; createdAt: string; businessName: string; startAt: string }>
  >([])
  const [reportReviewId, setReportReviewId] = useState<string | null>(null)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Array<{ businessId: string; name: string; category: string; city: string | null }>>(
    [],
  )

  const withTimeout = async <T,>(p: Promise<T>, timeoutMs: number, timeoutLabel: string): Promise<T> => {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error(timeoutLabel)), Math.max(1000, timeoutMs))
      }),
    ])
  }

  useEffect(() => {
    const p = profile
    if (!p) return
    setFirstName(p.first_name ?? '')
    setLastName(p.last_name ?? '')
    setPhone(p.phone ?? '')
    setCity(p.city ?? '')
    setAvatarUrl(p.avatar_url ?? '')
  }, [profile])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    let mounted = true
    setError(null)
    setLoading(true)

    ;(async () => {
      try {
        const [relRes, evRes, revRes, favRes, prefRes] = await withTimeout(
          Promise.all([
            supabase
              .from('customer_reliability')
              .select(
                'score,stars,completed_count,late_cancel_count,no_show_count,total_bookings,normal_cancel_count,rejected_requests_count,lost_deposits_count',
              )
              .eq('user_id', userId)
              .maybeSingle(),
            supabase
              .from('reliability_events')
              .select('kind,delta,created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(10),
            supabase
              .from('reviews')
              .select('id,rating,comment,created_at,businesses(name),bookings!inner(customer_user_id,start_at)')
              .eq('direction', 'business_to_customer')
              .eq('bookings.customer_user_id', userId)
              .order('created_at', { ascending: false })
              .limit(10),
            supabase
              .from('favorite_businesses')
              .select('business_id,businesses(id,name,category,city)')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(20),
            supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
          ]),
          12000,
          'Profile load timeout',
        )
        if (!mounted) return
        if (relRes.error) throw relRes.error
        if (evRes.error) throw evRes.error
        if (revRes.error) throw revRes.error
        if (favRes.error) throw favRes.error
        if (prefRes.error) throw prefRes.error

        const r = (relRes.data as {
          score: number
          stars: number
          completed_count: number
          late_cancel_count: number
          no_show_count: number
          total_bookings: number
          normal_cancel_count: number
          rejected_requests_count: number
          lost_deposits_count: number
        } | null) ?? null
        setReliability(
          r
            ? {
                score: r.score ?? 80,
                stars: r.stars ?? 0,
                completedCount: r.completed_count ?? 0,
                lateCancelCount: r.late_cancel_count ?? 0,
                noShowCount: r.no_show_count ?? 0,
                totalBookings: r.total_bookings ?? 0,
                normalCancelCount: r.normal_cancel_count ?? 0,
                rejectedRequestsCount: r.rejected_requests_count ?? 0,
                lostDepositsCount: r.lost_deposits_count ?? 0,
              }
            : null,
        )

        setEvents(
          (((evRes.data as Array<{ kind: string; delta: number; created_at: string }>) ?? [])
            .filter((x) => x && typeof x.kind === 'string')
            .map((x) => ({ kind: x.kind, delta: x.delta ?? 0, createdAt: x.created_at })) as Array<{
            kind: string
            delta: number
            createdAt: string
          }>) ?? [],
        )

        const firstRel = <T,>(x: T | T[] | null | undefined): T | null => {
          if (Array.isArray(x)) return x[0] ?? null
          return x ?? null
        }

        const raw = (revRes.data as unknown as Array<{
          id: string
          rating: number
          comment: string | null
          created_at: string
          businesses: { name: string } | Array<{ name: string }> | null
          bookings: { start_at: string } | Array<{ start_at: string }> | null
        }>) ?? []
        setReceivedReviews(
          raw
            .map((x) => {
              const biz = firstRel(x.businesses)
              const bk = firstRel(x.bookings)
              return { x, biz, bk }
            })
            .filter((x) => Boolean(x.biz?.name && x.bk?.start_at))
            .map((r) => ({
              id: r.x.id,
              rating: r.x.rating,
              comment: r.x.comment ?? null,
              createdAt: r.x.created_at,
              businessName: r.biz?.name ?? 'Attività',
              startAt: r.bk?.start_at ?? r.x.created_at,
            })),
        )

        const favRaw = (favRes.data as unknown as Array<{
          business_id: string
          businesses: { id: string; name: string; category: string; city: string | null } | Array<{ id: string; name: string; category: string; city: string | null }> | null
        }>)
        setFavorites(
          (favRaw ?? [])
            .map((x) => {
              const biz = firstRel(x.businesses)
              return biz ? { businessId: x.business_id, name: biz.name, category: biz.category, city: biz.city } : null
            })
            .filter(Boolean) as Array<{ businessId: string; name: string; category: string; city: string | null }>,
        )

        const prefParsed = prefRes.data ? safeParseUserPreferencesRow(prefRes.data) : null
        setPrefs(prefsFromRow(prefParsed))
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento profilo.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [userId])

  const displayName = useMemo(() => {
    const n = `${firstName.trim()} ${lastName.trim()}`.trim()
    return n || 'Utente'
  }, [firstName, lastName])

  const canSave = useMemo(() => {
    if (!profile || !userId) return false
    return (
      firstName !== (profile.first_name ?? '') ||
      lastName !== (profile.last_name ?? '') ||
      phone !== (profile.phone ?? '') ||
      city !== (profile.city ?? '') ||
      avatarUrl !== (profile.avatar_url ?? '')
    )
  }, [avatarUrl, city, firstName, lastName, phone, profile, userId])

  return (
    <AppShell>
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Card padded={false} className="p-6 md:p-8 shadow-xl shadow-black/20 border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <Avatar name={displayName} src={avatarUrl || null} size="lg" />
                  <div>
                    <div className="text-sm font-semibold text-white">{displayName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">Ruolo: {profile?.role ?? '—'}</Badge>
                      <Badge tone={trustBadge.badgeTone}>Affidabilità: {trustBadge.labelIt}</Badge>
                      <Badge tone="info">Score: {effective.effectiveScore}/100</Badge>
                      <Badge tone="neutral">Tier: {tierFromStars(reliability?.stars ?? 0)}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-white/70">
                      La reputazione è uno strumento anti no-show: mostra come le tue azioni impattano prenotazioni e caparre.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to="/impostazioni">
                    <Button type="button" variant="secondary" size="sm" rightIcon={<ChevronRight className="h-4 w-4" />}>
                      Impostazioni
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canSave || saving || !userId}
                    leftIcon={<Save className="h-4 w-4" />}
                    onClick={() => {
                      if (!userId) return
                      setError(null)
                      setSaving(true)
                      ;(async () => {
                        try {
                          const payload: Partial<ProfileRow> = {
                            first_name: firstName.trim() || null,
                            last_name: lastName.trim() || null,
                            phone: phone.trim() || null,
                            city: city.trim() || null,
                            avatar_url: avatarUrl.trim() || null,
                          }

                          const { error: upErr } = await supabase.from('profiles').update(payload).eq('id', userId)
                          if (upErr) throw upErr
                          await refreshProfile()
                        } catch (e: unknown) {
                          setError(errorMessage(e, 'Errore salvataggio.'))
                        } finally {
                          setSaving(false)
                        }
                      })()
                    }}
                  >
                    {saving ? 'Salvataggio…' : 'Salva'}
                  </Button>
                </div>
              </div>
            </Card>

            <Card padded={false} className="p-6 md:p-8 mt-4 border-white/5 bg-white/[0.02] shadow-inner">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/80">
                <User className="h-4 w-4" />
                Identità & Contatti
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="tb-label">Nome</div>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" className="mt-1" />
                </div>
                <div>
                  <div className="tb-label">Cognome</div>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" className="mt-1" />
                </div>
                <div>
                  <div className="tb-label">Telefono</div>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="+39 333 123 4567"
                    className="mt-1"
                  />
                </div>
                <div>
                  <div className="tb-label">Città</div>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Roma" className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <div className="tb-label">Foto profilo (URL)</div>
                  <Input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    inputMode="url"
                    placeholder="https://..."
                    className="mt-1"
                  />
                  <div className="mt-2 text-xs text-white/60">Se preferisci, gestisci la privacy e la posizione da Impostazioni.</div>
                </div>
              </div>
            </Card>

            <div className="mt-4">
              <CustomerSubscriptionPanel />
            </div>
          </div>

          <div className="space-y-4 lg:col-span-4">
            <Card padded={false} className="p-6 border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent shadow-xl">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#4F7CFF]">
                <Shield className="h-4 w-4" />
                Fiducia & Reputazione
              </div>
              <div className="mt-2 text-xs text-white/70">Chiaro, spiegabile, senza meccaniche opache.</div>

              {loading ? (
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-16" />
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-white/60">Punteggio effettivo</div>
                      <div className="mt-1 text-2xl font-semibold text-white">{effective.effectiveScore}/100</div>
                      <div className="mt-1 text-xs text-white/60">
                        Base {effective.baseScore} · Boost {effective.boost} · Penalità {effective.penalty}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80">
                        <Star className={(reliability?.score ?? 80) === 100 ? 'h-4 w-4 fill-[#4F7CFF] text-[#4F7CFF]' : 'h-4 w-4 text-white/60'} />
                        Stelle: {reliability?.stars ?? 0}
                      </div>
                      <div className="mt-2">
                        <Badge tone={trustBadge.badgeTone}>Affidabilità: {trustBadge.labelIt}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[#4F7CFF]" style={{ width: `${effective.effectiveScore}%` }} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/70">
                    <div>
                      <div className="text-white/60">Completate</div>
                      <div className="mt-1 font-semibold text-white">{reliability?.completedCount ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-white/60">Cancel tardive</div>
                      <div className="mt-1 font-semibold text-white">{reliability?.lateCancelCount ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-white/60">No-show</div>
                      <div className="mt-1 font-semibold text-white">{reliability?.noShowCount ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-white/60">Prenotazioni</div>
                      <div className="mt-1 font-semibold text-white">{reliability?.totalBookings ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-white/60">Cancel normali</div>
                      <div className="mt-1 font-semibold text-white">{reliability?.normalCancelCount ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-white/60">Rifiutate</div>
                      <div className="mt-1 font-semibold text-white">{reliability?.rejectedRequestsCount ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-white/60">Caparre perse</div>
                      <div className="mt-1 font-semibold text-white">{reliability?.lostDepositsCount ?? 0}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white/60">
                      <Info className="h-4 w-4" />
                      Come funziona
                    </div>
                    <div className="mt-2 text-xs text-white/70">
                      Eff = base + bonus stelle − penalità. Le penalità aumentano con no-show e cancellazioni tardive.
                    </div>
                    <div className="mt-2 text-xs text-white/60">Suggerimento: conferma o cancella in anticipo per evitare penalità.</div>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="text-xs font-semibold text-white/60">Eventi recenti</div>
                <div className="mt-2 space-y-2">
                  {loading ? (
                    <Skeleton className="h-20" />
                  ) : events.length === 0 ? (
                    <EmptyState title="Nessun evento recente" description="Quando cambia qualcosa nel tuo score lo vedrai qui." />
                  ) : (
                    events.slice(0, 6).map((e, idx) => (
                      <div key={`${e.createdAt}_${idx}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <div className="text-white/70">{e.kind}</div>
                          <div className={e.delta < 0 ? 'font-semibold text-red-100' : 'font-semibold text-emerald-50'}>
                            {e.delta < 0 ? e.delta : `+${e.delta}`}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-white/60">{formatDateTime(e.createdAt)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>

            <Card padded={false} className="p-6 border-white/5 bg-white/[0.02] shadow-inner">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold uppercase tracking-wider text-white/80">Preferenze</div>
                  <div className="mt-1 text-xs text-white/70">Privacy e notifiche configurate.</div>
                </div>
                <Link to="/impostazioni">
                  <Button type="button" variant="secondary" size="sm" rightIcon={<ChevronRight className="h-4 w-4" />}>
                    Gestisci
                  </Button>
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                  Profilo: <span className="text-white">{prefs.profileVisibility === 'public' ? 'pubblico' : 'privato'}</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                  Posizione: <span className="text-white">{prefs.locationSharing}</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                  Notifiche in-app: <span className="text-white">{prefs.channelInApp ? 'on' : 'off'}</span>
                </div>
              </div>
            </Card>

            <Card padded={false} className="p-6 border-white/5 bg-white/[0.02] shadow-inner">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-400">
                <BadgeCheck className="h-4 w-4" />
                Recensioni ricevute
              </div>
              <div className="mt-1 text-xs text-white/70">Solo dopo una prenotazione completata o no-show registrato dall’attività.</div>
              <div className="mt-2 rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-white/60">
                Questi messaggi sono tra te e il sistema TrustBook (non pubblici). Se ritieni che un commento sia illegittimo o lesivo,
                puoi segnalarlo: non sostituisce azioni legali o reclami verso l’attività.
              </div>
              <div className="mt-3 space-y-2">
                {loading ? (
                  <Skeleton className="h-24" />
                ) : receivedReviews.length === 0 ? (
                  <EmptyState title="Ancora nessuna recensione" description="Quando arrivano, le troverai qui." />
                ) : (
                  receivedReviews.slice(0, 6).map((r) => (
                    <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">★ {r.rating}</div>
                          <div className="mt-1 text-xs text-white/70">{r.businessName}</div>
                        </div>
                        <div className="text-right text-xs text-white/60">{formatDateTime(r.startAt)}</div>
                      </div>
                      {r.comment ? <div className="mt-2 text-sm text-white/70">{r.comment}</div> : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setReportError(null)
                          setReportReviewId(r.id)
                        }}
                      >
                        Segnala al team TrustBook
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card padded={false} className="p-6 border-white/5 bg-white/[0.02] shadow-inner">
              <div className="text-sm font-bold uppercase tracking-wider text-rose-400">Preferiti</div>
              <div className="mt-1 text-xs text-white/70">Le attività che hai salvato per dopo.</div>
              <div className="mt-3 space-y-2">
                {loading ? (
                  <Skeleton className="h-20" />
                ) : favorites.length === 0 ? (
                  <EmptyState title="Nessun preferito" description="Aggiungi un’attività ai preferiti da Esplora." />
                ) : (
                  favorites.map((b) => (
                    <Link
                      key={b.businessId}
                      to={`/attivita/${encodeURIComponent(b.businessId)}`}
                      className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                    >
                      <div className="text-sm font-semibold text-white">{b.name}</div>
                      <div className="mt-1 text-xs text-white/70">
                        {b.category}
                        {b.city ? ` · ${b.city}` : ''}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <ReviewReportModal
        open={reportReviewId !== null}
        busy={reportBusy}
        error={reportError}
        title="Segnala una valutazione ricevuta"
        description="Descrivi perché ritieni il contenuto improprio (linguaggio ingiurioso, dichiarazioni false gravi, dati sensibili). TrustBook può prendere provvedimenti solo nell’ambito della piattaforma."
        onClose={() => {
          if (!reportBusy) setReportReviewId(null)
        }}
        onSubmit={async (reason) => {
          if (!reportReviewId || !userId) return
          setReportBusy(true)
          setReportError(null)
          try {
            const { error } = await supabase.rpc('submit_review_report', {
              p_review_id: reportReviewId,
              p_reason: reason,
            })
            if (error) throw error
            push({
              tone: 'success',
              title: 'Segnalazione registrata',
              description: 'Esamineremo il contenuto nei tempi operativi previsti.',
            })
            setReportReviewId(null)
          } catch (e: unknown) {
            setReportError(errorMessage(e, 'Impossibile inviare la segnalazione.'))
          } finally {
            setReportBusy(false)
          }
        }}
      />
    </AppShell>
  )
}
