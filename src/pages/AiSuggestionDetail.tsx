import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BrainCircuit } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { useAuth } from '@/providers/authContext'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import type { AiSuggestionRow } from '@/domain/supabase'
import { safeParseAiSuggestionRow } from '@/domain/parse'
import { formatDateTime } from '@/utils/time'
import { cn } from '@/lib/utils'
import { redactEvidenceLinesForUi } from '@/lib/aiEvidenceDisplay'

function asEvidenceList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean)
  return []
}

function ctaLabel(actionType: string): string {
  if (actionType === 'UPDATE_BUSINESS_DEPOSIT') return 'Applica caparra'
  if (actionType === 'UPDATE_BUSINESS_APPROVAL_MODE') return 'Attiva risk-based'
  if (actionType === 'UPDATE_SERVICE_PRICE') return 'Aggiorna prezzo'
  if (actionType === 'UPDATE_BUSINESS_MIN_GAP') return 'Riduci buffer'
  if (actionType === 'ADD_CUSTOMER_TAG') return 'Tagga cliente'
  if (actionType === 'UPDATE_BUSINESS_NOSHOW_GUARDS') return 'Applica soglie anti no-show'
  if (actionType === 'UPDATE_BUSINESS_DESCRIPTION') return 'Applica descrizione attività'
  if (actionType === 'UPDATE_SERVICE_DESCRIPTION') return 'Applica descrizione servizio'
  if (actionType === 'SCHEDULE_EXTRA_REMINDER') return 'Programma reminder extra'
  return 'Applica'
}

export default function AiSuggestionDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const { profile } = useAuth()
  const [row, setRow] = useState<AiSuggestionRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || profile?.role !== 'attivita') return
    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error: qErr } = await supabase.from('ai_suggestions').select('*').eq('id', id).maybeSingle()
        if (!mounted) return
        if (qErr) throw qErr
        const parsed = data ? safeParseAiSuggestionRow(data) : null
        setRow(parsed)
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Impossibile caricare il suggerimento.'))
        setRow(null)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [id, profile?.role])

  const evidence = useMemo(() => redactEvidenceLinesForUi(row ? asEvidenceList(row.evidence) : []), [row])

  if (profile?.role !== 'attivita') {
    return <Navigate to="/dashboard-attivita" replace />
  }

  if (!id) {
    return <Navigate to="/dashboard-attivita" replace />
  }

  const canApply = Boolean(row && (row.status === 'new' || row.status === 'read') && row.action_type !== 'INFO_ONLY')

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav(-1)}>
            Indietro
          </Button>
          <Link to="/dashboard-attivita" className="text-xs font-semibold text-white/60 underline underline-offset-2 hover:text-white">
            Dashboard attività
          </Link>
        </div>

        <Card padded={false} className="p-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <BrainCircuit className="h-5 w-5 text-white/80" />
            </div>
            <div>
              <div className="tb-kicker">SUGGERIMENTO INTELLIGENTE (REGOLE)</div>
              <h1 className="mt-1 text-xl font-bold text-white">{loading ? 'Caricamento…' : row?.title ?? 'Non trovato'}</h1>
              {row?.generated_at ? (
                <div className="mt-1 text-xs text-white/50">Generato: {formatDateTime(row.generated_at)}</div>
              ) : null}
            </div>
          </div>

          {!loading && row ? (
            <Alert tone="info" className="mt-6">
              Suggerimento generato da <strong>regole deterministiche</strong> sul tuo storico (nessun modello linguistico esterno). Le azioni applicabili
              sono validate lato server; gli identificativi tecnici nelle evidenze sono mascherati qui per ridurre fughe accidentali da screenshot.
            </Alert>
          ) : null}

          {error ? (
            <Alert className="mt-6" tone="danger">
              {error}
            </Alert>
          ) : null}

          {!loading && !row ? (
            <Alert className="mt-6" tone="warning">
              Suggerimento assente o non visibile con il tuo account (solo owner attività). Torna alla panoramica e rigenera dalla
              dashboard.
            </Alert>
          ) : null}

          {row ? (
            <div className="mt-6 space-y-4 text-sm text-white/80">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Stato</div>
                <div className="mt-1 font-medium text-white">{row.status}</div>
              </div>
              {row.explanation ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Spiegazione</div>
                  <p className="mt-1 leading-relaxed">{row.explanation}</p>
                </div>
              ) : null}
              {row.expected_impact ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Impatto atteso</div>
                  <p className="mt-1">{row.expected_impact}</p>
                </div>
              ) : null}
              {evidence.length ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Evidenze</div>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-white/70">
                    {evidence.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  disabled={!canApply || busy}
                  onClick={() => {
                    if (!row) return
                    setBusy(true)
                    setError(null)
                    ;(async () => {
                      try {
                        const { error: rpcErr } = await supabase.rpc('apply_ai_suggestion', { p_suggestion_id: row.id })
                        if (rpcErr) throw rpcErr
                        nav('/dashboard-attivita', { replace: true })
                      } catch (e: unknown) {
                        setError(errorMessage(e, 'Applicazione fallita.'))
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                >
                  {busy ? 'Applicazione…' : ctaLabel(row.action_type)}
                </Button>
                {row.status === 'new' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (!row) return
                      setBusy(true)
                      setError(null)
                      ;(async () => {
                        try {
                          const { error: rpcErr } = await supabase.rpc('mark_ai_suggestion_read', { p_suggestion_id: row.id })
                          if (rpcErr) throw rpcErr
                          const { data, error: qErr } = await supabase.from('ai_suggestions').select('*').eq('id', row.id).maybeSingle()
                          if (qErr) throw qErr
                          setRow(data ? safeParseAiSuggestionRow(data) : null)
                        } catch (e: unknown) {
                          setError(errorMessage(e, 'Impossibile segnare come letto.'))
                        } finally {
                          setBusy(false)
                        }
                      })()
                    }}
                  >
                    Segna letto
                  </Button>
                ) : null}
                {row.status === 'new' || row.status === 'read' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (!row) return
                      setBusy(true)
                      setError(null)
                      ;(async () => {
                        try {
                          const { error: rpcErr } = await supabase.rpc('dismiss_ai_suggestion', { p_suggestion_id: row.id })
                          if (rpcErr) throw rpcErr
                          nav('/dashboard-attivita', { replace: true })
                        } catch (e: unknown) {
                          setError(errorMessage(e, 'Impossibile scartare il suggerimento.'))
                        } finally {
                          setBusy(false)
                        }
                      })()
                    }}
                  >
                    Scarta
                  </Button>
                ) : null}
                <span className={cn('self-center text-xs text-white/50')}>Priorità {row.priority}</span>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </AppShell>
  )
}
