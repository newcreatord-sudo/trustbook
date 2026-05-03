import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, UserRoundCog } from 'lucide-react'
import type { TeamMemberRow } from '@/domain/supabase'
import type { BusinessFeatureGate } from '@/lib/subscriptions'
import { canAddStaff } from '@/lib/subscriptions'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Input from '@/shared/ui/Input'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default function StaffManager(props: {
  businessId: string
  isOwner: boolean
  accessToken: string | null
  featureGate: BusinessFeatureGate
  onNavigateSubscription?: () => void
}) {
  const [members, setMembers] = useState<TeamMemberRow[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const normalized = useMemo(() => input.trim(), [input])
  const staffSlotsUsed = useMemo(() => members.filter((m) => m.role === 'staff').length, [members])
  const staffLimitReached = useMemo(
    () => !canAddStaff(staffSlotsUsed, props.featureGate),
    [staffSlotsUsed, props.featureGate],
  )
  const canSave = useMemo(
    () => Boolean(props.isOwner && !saving && normalized && !staffLimitReached),
    [props.isOwner, saving, normalized, staffLimitReached],
  )

  useEffect(() => {
    let mounted = true
    setError(null)
    setLoading(true)

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('team_members')
          .select('*')
          .eq('business_id', props.businessId)
          .order('created_at', { ascending: true })
        if (!mounted) return
        if (error) throw error
        setMembers((data as TeamMemberRow[]) ?? [])
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento staff.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [props.businessId])

  if (!props.isOwner) {
    return (
      <Card padded className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <UserRoundCog className="h-4 w-4" />
          Staff
        </div>
        <div className="mt-2 text-sm text-white/70">
          Solo l’owner può gestire lo staff.
        </div>
      </Card>
    )
  }

  return (
    <Card padded={false} className="p-5">
      <div>
        <div className="flex items-center gap-2 tb-title">
          <UserRoundCog className="h-5 w-5" />
          Staff
        </div>
        <div className="tb-subtitle mt-1">Aggiungi membri per gestire prenotazioni e chat.</div>
      </div>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      {staffLimitReached ? (
        <Alert tone="warning" className="mt-4">
          <span className="block">
            Limite piano: massimo{' '}
            {props.featureGate.maxStaff >= 999 ? 'staff illimitati sul piano attuale' : `${props.featureGate.maxStaff} membri staff`}.
            Aggiorna il piano per invitarne altri.
          </span>
          {props.onNavigateSubscription ? (
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={props.onNavigateSubscription}>
              Tab Abbonamento
            </Button>
          ) : null}
        </Alert>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="tb-kicker">AGGIUNGI STAFF</div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="tb-label">Email o User ID</label>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="es. staff@email.it oppure uuid"
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={!canSave}
              leftIcon={<Plus className="h-4 w-4" />}
              className="w-full"
              onClick={() => {
                setError(null)
                const raw = normalized
                if (!raw) return
                if (!canAddStaff(staffSlotsUsed, props.featureGate)) {
                  return setError(
                    `Limite piano raggiunto (max ${props.featureGate.maxStaff} staff). Aggiorna dalla tab Abbonamento.`,
                  )
                }
                const isEmail = raw.includes('@')
                if (!isEmail && !isUuid(raw)) {
                  return setError('Inserisci una email valida o un User ID UUID valido.')
                }
                setSaving(true)

                ;(async () => {
                  try {
                    const { data, error } = isEmail
                      ? await supabase.rpc('business_add_staff_by_email', {
                          p_business_id: props.businessId,
                          p_email: raw,
                        })
                      : await supabase
                          .from('team_members')
                          .insert({ business_id: props.businessId, user_id: raw, role: 'staff' })
                          .select('*')
                          .single()
                    if (error) throw error

                    if (isEmail) {
                      const { data: refetch, error: refetchErr } = await supabase
                        .from('team_members')
                        .select('*')
                        .eq('business_id', props.businessId)
                        .order('created_at', { ascending: true })
                      if (refetchErr) throw refetchErr
                      setMembers((refetch as TeamMemberRow[]) ?? [])
                    } else {
                      setMembers((prev) => [...prev, data as TeamMemberRow])
                    }
                    setInput('')
                  } catch (e: unknown) {
                    setError(errorMessage(e, 'Errore aggiunta staff.'))
                  } finally {
                    setSaving(false)
                  }
                })()
              }}
            >
              Aggiungi
            </Button>
          </div>
        </div>
        <div className="mt-3 text-xs text-white/60">
          Il membro deve avere un account Trustbook. Se inserisci email, viene risolta in user id.
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <EmptyState title="Caricamento in corso..." />
        ) : members.length === 0 ? (
          <EmptyState title="Nessun membro staff ancora" description="Aggiungi persone al team per aiutarti a gestire l'attività." />
        ) : (
          members.map((m) => {
            const isOwnerRow = m.role === 'owner'
            return (
              <div key={m.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{m.user_id}</div>
                    <div className="mt-1 text-xs text-white/70">Ruolo: {m.role}</div>
                  </div>

                  <Button
                    type="button"
                    disabled={saving || isOwnerRow}
                    variant={isOwnerRow ? 'secondary' : 'danger'}
                    size="sm"
                    leftIcon={<Minus className="h-4 w-4" />}
                    onClick={() => {
                      setError(null)
                      setSaving(true)
                      ;(async () => {
                        try {
                          const { error } = await supabase.from('team_members').delete().eq('id', m.id)
                          if (error) throw error
                          setMembers((prev) => prev.filter((x) => x.id !== m.id))
                        } catch (e: unknown) {
                          setError(errorMessage(e, 'Errore rimozione staff.'))
                        } finally {
                          setSaving(false)
                        }
                      })()
                    }}
                  >
                    Rimuovi
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
