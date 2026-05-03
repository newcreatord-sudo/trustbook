import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck, Store, User } from 'lucide-react'
import type { UserRole } from '@/domain/supabase'
import { cn } from '@/lib/utils'
import { getPreferredRole, setPreferredRole } from '@/shared/storage/preferredRole'
import { encodeNext, safeNextPath } from '@/shared/navigation/next'
import Button from '@/shared/ui/Button'

export default function Start() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const initial = useMemo(() => getPreferredRole() ?? 'cliente', [])
  const [role, setRole] = useState<UserRole>(initial)

  useEffect(() => {
    const r = searchParams.get('role')
    if (r === 'cliente' || r === 'attivita') {
      setRole(r)
      setPreferredRole(r)
    }
  }, [searchParams])

  const next = safeNextPath(searchParams.get('next'))
  const nextQ = next ? `&next=${encodeNext(next)}` : ''

  return (
    <div className="tb-page grid grid-cols-1 gap-6 py-6 md:grid-cols-2 md:py-16">
      <div className="tb-card tb-card-pad">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#4F7CFF]">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="tb-title">TrustBook</div>
            <div className="tb-subtitle">Scegli il profilo per personalizzare l’esperienza.</div>
          </div>
        </div>

        <div className="tb-note mt-6">
          Puoi cambiare profilo in qualsiasi momento dalle impostazioni.
        </div>
      </div>

      <div className="tb-card tb-card-pad">
        <div className="tb-kicker">CHI SEI?</div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => setRole('cliente')}
            className={cn(
              'tb-choice',
              role === 'cliente' ? 'tb-choice-active' : 'tb-choice-idle',
            )}
          >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Cliente</div>
              <div className="mt-1 text-xs text-white/70">
                Cerchi su mappa, prenoti veloce e costruisci reputazione.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setRole('attivita')}
            className={cn(
              'tb-choice',
              role === 'attivita' ? 'tb-choice-active' : 'tb-choice-idle',
            )}
          >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Attività</div>
              <div className="mt-1 text-xs text-white/70">
                Ricevi prenotazioni filtrate, caparra intelligente e meno no-show.
              </div>
            </div>
          </button>
        </div>

        <Button
          type="button"
          onClick={() => {
            setPreferredRole(role)
            nav(`/login?mode=register&role=${encodeURIComponent(role)}${nextQ}`, { replace: true })
          }}
          className="mt-5 w-full"
        >
          Continua
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setPreferredRole(role)
            nav(`/login?mode=login&role=${encodeURIComponent(role)}${nextQ}`, { replace: true })
          }}
          className="mt-2 w-full"
        >
          Ho già un account
        </Button>
      </div>
    </div>
  )
}

