import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrainCircuit, RefreshCw, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'
import Select from '@/shared/ui/Select'
import { cn } from '@/lib/utils'
import type { AiSuggestionAuditRow, AiSuggestionRow } from '@/domain/supabase'
import { safeParseAiSuggestionAuditRow, safeParseAiSuggestionRow } from '@/domain/parse'
import { formatDateTime } from '@/utils/time'
import { fetchBusinessBookingEcosystem, type BusinessBookingEcosystemRow } from '@/lib/businessEcosystem'
import { redactEvidenceLinesForUi } from '@/lib/aiEvidenceDisplay'
import { VERTICAL_PLAYBOOKS, suggestedArchetypeFromCategory } from '@/lib/verticalPlaybooks'

type Props = {
  businessId: string
  isOwner: boolean
  /** Categoria profilo attività — solo testo orientativo accanto agli euristici. */
  businessCategory?: string | null
}

function asEvidenceList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean)
  return []
}

function isActionable(s: AiSuggestionRow): boolean {
  return s.action_type !== 'INFO_ONLY'
}

function canApply(s: AiSuggestionRow, isOwner: boolean): boolean {
  if (s.status !== 'new' && s.status !== 'read') return false
  if (!isActionable(s)) return false
  return isOwner
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

function parseAutoApplyPayload(data: unknown): { applied: number; failures: number } {
  const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const applied = typeof o.applied_count === 'number' ? o.applied_count : 0
  const fc = typeof o.failure_count === 'number' ? o.failure_count : null
  const f = o.failures
  const arrLen = Array.isArray(f) ? f.length : 0
  const failures = fc !== null ? fc : arrLen
  return { applied, failures }
}

type AgentExecLogRow = {
  id: string
  tool_name: string
  parameters: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
}

function safeParseAgentLogRow(raw: unknown): AgentExecLogRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : null
  const tool_name = typeof r.tool_name === 'string' ? r.tool_name : null
  const created_at = typeof r.created_at === 'string' ? r.created_at : null
  if (!id || !tool_name || !created_at) return null
  const parameters =
    typeof r.parameters === 'object' && r.parameters !== null && !Array.isArray(r.parameters)
      ? (r.parameters as Record<string, unknown>)
      : {}
  const result =
    typeof r.result === 'object' && r.result !== null && !Array.isArray(r.result)
      ? (r.result as Record<string, unknown>)
      : null
  const error = typeof r.error === 'string' ? r.error : null
  return { id, tool_name, parameters, result, error, created_at }
}

function toolLabel(tool: string): string {
  if (tool === 'auto_apply_whitelisted_ai_suggestions_started') return 'Batch agente — avvio'
  if (tool === 'auto_apply_whitelisted_ai_suggestions_finished') return 'Batch agente — completato'
  if (tool === 'apply_ai_suggestion') return 'Applica suggerimento'
  if (tool === 'ai_get_floor_plan_bundle') return 'Director — lettura planimetria'
  if (tool === 'ai_list_available_tables_for_slot') return 'Director — tavoli disponibili'
  if (tool === 'ai_assign_table_to_booking') return 'Director — assegna tavolo'
  if (tool === 'ai_auto_assign_table_for_booking') return 'Director — auto-assegna tavolo'
  if (tool === 'ai_upsert_blocked_slot') return 'Director — blocco disponibilità'
  if (tool === 'ai_delete_blocked_slot') return 'Director — rimuovi blocco'
  return tool
}

function priorityBadge(priority: number): { label: string; cls: string } {
  if (priority >= 85) return { label: 'Alta', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50' }
  if (priority >= 65) return { label: 'Media', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-50' }
  return { label: 'Bassa', cls: 'border-white/10 bg-white/5 text-white/80' }
}

function statusBadge(status: AiSuggestionRow['status']): { label: string; cls: string } {
  if (status === 'new') return { label: 'Nuovo', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-50' }
  if (status === 'read') return { label: 'Letto', cls: 'border-white/10 bg-white/5 text-white/70' }
  if (status === 'applied') return { label: 'Applicato', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50' }
  return { label: 'Scartato', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-50' }
}

export default function BusinessAiSuggestionsPanel(props: Props) {
  const [suggestions, setSuggestions] = useState<AiSuggestionRow[]>([])
  const [audit, setAudit] = useState<AiSuggestionAuditRow[]>([])
  const [rangeDays, setRangeDays] = useState(30)
  const [statusView, setStatusView] = useState<'inbox' | 'new' | 'read' | 'applied' | 'dismissed'>('inbox')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [eco, setEco] = useState<BusinessBookingEcosystemRow | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchNote, setBatchNote] = useState<string | null>(null)
  const [backgroundRegenerating, setBackgroundRegenerating] = useState(false)
  const [agentExecLog, setAgentExecLog] = useState<AgentExecLogRow[]>([])

  const refresh = async (opts?: { regenerate?: boolean }) => {
    setError(null)
    try {
      if (opts?.regenerate) {
        const { error } = await supabase.rpc('generate_ai_suggestions', {
          p_business_id: props.businessId,
          p_range_days: rangeDays,
        })
        if (error) throw error
      }

      const statusFilter =
        statusView === 'inbox'
          ? ['new', 'read']
          : statusView === 'new'
            ? ['new']
            : [statusView]

      const [sRes, aRes, logRes] = await Promise.all([
        (() => {
          let q = supabase.from('ai_suggestions').select('*').eq('business_id', props.businessId)
          q = q.in('status', statusFilter as unknown as string[])
          if (statusView === 'inbox' || statusView === 'new' || statusView === 'read') {
            q = q.order('priority', { ascending: false }).order('generated_at', { ascending: false })
          } else {
            q = q.order('generated_at', { ascending: false })
          }
          return q.limit(20)
        })(),
        supabase
          .from('ai_suggestion_audit')
          .select('*')
          .eq('business_id', props.businessId)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('ai_agent_execution_log')
          .select('id,tool_name,parameters,result,error,created_at')
          .eq('business_id', props.businessId)
          .order('created_at', { ascending: false })
          .limit(16),
      ])
      if (sRes.error) throw sRes.error
      if (aRes.error) throw aRes.error
      if (logRes.error) throw logRes.error

      const list = (((sRes.data as unknown[]) ?? []) as unknown[])
        .map((x) => safeParseAiSuggestionRow(x))
        .filter(Boolean) as AiSuggestionRow[]
      const aud = (((aRes.data as unknown[]) ?? []) as unknown[])
        .map((x) => safeParseAiSuggestionAuditRow(x))
        .filter(Boolean) as AiSuggestionAuditRow[]
      const logs = (((logRes.data as unknown[]) ?? []) as unknown[])
        .map((x) => safeParseAgentLogRow(x))
        .filter(Boolean) as AgentExecLogRow[]

      setSuggestions(list)
      setAudit(aud)
      setAgentExecLog(logs)
      setGeneratedAt(list[0]?.generated_at ?? null)

      try {
        const er = await fetchBusinessBookingEcosystem(props.businessId)
        setEco(er)
      } catch {
        setEco(null)
      }
    } catch (e: unknown) {
      setError(errorMessage(e, 'Errore caricamento suggerimenti.'))
    }
  }

  useEffect(() => {
    if (!props.isOwner) {
      setSuggestions([])
      setAudit([])
      setAgentExecLog([])
      setError(null)
      setLoading(false)
      setBackgroundRegenerating(false)
      return
    }

    let mounted = true
    setLoading(true)
    setBackgroundRegenerating(false)
    ;(async () => {
      await refresh({ regenerate: false })
      if (!mounted) return
      setLoading(false)
      setBackgroundRegenerating(true)
      try {
        await refresh({ regenerate: true })
      } finally {
        if (mounted) setBackgroundRegenerating(false)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.businessId, props.isOwner])

  useEffect(() => {
    if (!props.isOwner) return
    ;(async () => {
      await refresh({ regenerate: false })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusView])

  const playbookHint = useMemo(() => {
    const cat = props.businessCategory?.trim()
    if (!cat) return null
    const id = suggestedArchetypeFromCategory(cat)
    return VERTICAL_PLAYBOOKS[id]?.shortLabel ?? null
  }, [props.businessCategory])

  const canAutoBatch = useMemo(() => {
    if (!props.isOwner || !eco) return false
    return (
      eco.ai_execution_mode === 'auto_whitelisted' &&
      eco.ai_strict_confirmation_required === false &&
      Array.isArray(eco.ai_auto_action_types) &&
      eco.ai_auto_action_types.length > 0
    )
  }, [eco, props.isOwner])

  const auditTitle = useMemo(() => {
    const last = audit[0]
    if (!last) return null
    const label = last.result === 'success' ? 'Ultima azione applicata' : 'Ultimo tentativo fallito'
    return `${label}: ${formatDateTime(last.created_at)}`
  }, [audit])

  if (!props.isOwner) {
    return (
      <Card padded={false} className="mt-4 border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <BrainCircuit className="h-4 w-4 text-white/70" />
          </div>
          <div className="min-w-0">
            <div className="tb-kicker">SUGGERIMENTI INTELLIGENTI</div>
            <p className="mt-1 text-sm text-white/70 leading-relaxed">
              Suggerimenti deterministici basati su regole e storico. Applicazioni e audit sono disponibili solo per l&apos;owner dell&apos;attività
              (caparre e impostazioni sensibili).
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card padded={false} className="mt-4 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <BrainCircuit className="h-4 w-4 text-white/80" />
          </div>
          <div>
            <div className="tb-kicker">SUGGERIMENTI INTELLIGENTI (REGOLE)</div>
            <div className="mt-1 text-base font-semibold text-white">Director operativo per appuntamenti</div>
            <div className="mt-1 text-xs text-white/60">
              Regole deterministiche su storico: orari migliori, slot critici, buchi agenda, avvisi cancellazioni, caparra/approval e reminder extra
              (solo in-app). Non spostano appuntamenti in automatico: azioni applicabili passano da RPC validate sul server.
              {playbookHint ? (
                <>
                  {' '}
                  Playbook consigliato da categoria: <span className="text-white/80">{playbookHint}</span>.
                </>
              ) : null}{' '}
              Auto-applica solo whitelist + modalità server in ecosistema.{' '}
              {generatedAt ? `Aggiornati: ${formatDateTime(generatedAt)}` : ''}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={statusView}
            onChange={(e) => setStatusView((e.target.value as typeof statusView) || 'inbox')}
            className="h-10"
            aria-label="Filtro stato"
          >
            <option value="inbox">Da gestire (nuovi + letti)</option>
            <option value="new">Solo nuovi</option>
            <option value="read">Solo letti</option>
            <option value="applied">Applicati</option>
            <option value="dismissed">Scartati</option>
          </Select>
          <Select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value) || 30)}
            className="h-10"
            aria-label="Finestra analisi"
          >
            <option value={7}>Ultimi 7 giorni</option>
            <option value={30}>Ultimi 30 giorni</option>
            <option value={90}>Ultimi 90 giorni</option>
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className={cn('h-4 w-4', busy || backgroundRegenerating ? 'animate-spin' : '')} />}
            disabled={busy || backgroundRegenerating || !props.isOwner}
            onClick={() => {
              setBusy(true)
              ;(async () => {
                try {
                  await refresh({ regenerate: true })
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            Rigenera
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || backgroundRegenerating || batchBusy || !canAutoBatch}
            onClick={() => {
              setBatchNote(null)
              setError(null)
              setBatchBusy(true)
              ;(async () => {
                try {
                  const { data, error: rpcErr } = await supabase.rpc('auto_apply_whitelisted_ai_suggestions', {
                    p_business_id: props.businessId,
                  })
                  if (rpcErr) throw rpcErr
                  const { applied, failures } = parseAutoApplyPayload(data)
                  setBatchNote(
                    `Batch completato: ${applied} suggerimenti applicati.${failures > 0 ? ` Falliti: ${failures}.` : ''} Dettaglio nel registro agente sotto.`,
                  )
                  await refresh()
                } catch (e: unknown) {
                  setError(errorMessage(e, 'Batch automatico non eseguito.'))
                } finally {
                  setBatchBusy(false)
                }
              })()
            }}
          >
            {batchBusy ? 'Batch…' : 'Applica batch (whitelist)'}
          </Button>
        </div>
      </div>

      {backgroundRegenerating ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65">
          Aggiornamento suggerimenti in corso… la lista può cambiare tra pochi secondi.
        </div>
      ) : null}

      <Alert tone="info" className="mt-4">
        Nessuna AI finta: sono regole deterministiche. Azioni applicabili passano solo da RPC validate sul server (nessun aggiornamento diretto fuori
        schema). Per appuntamenti e spostamenti restano vincoli di disponibilità e transizioni di stato.
      </Alert>

      {props.isOwner && eco !== null && !canAutoBatch ? (
        <Alert tone="warning" className="mt-3">
          Il batch automatico server è disattivo: in ecosistema prenotazioni servono modalità «auto + whitelist», conferma stretta disattiva e almeno un tipo azione selezionato.
        </Alert>
      ) : null}

      {canAutoBatch ? (
        <Alert tone="info" className="mt-3">
          Batch autorizzato: il server applica <strong>solo</strong> i tipi in whitelist tramite{' '}
          <code className="text-[10px]">apply_ai_suggestion</code>, verifica i tipi contro un elenco consentito, elabora al massimo 40 suggerimenti per esecuzione e registra ogni passo in{' '}
          <code className="text-[10px]">ai_agent_execution_log</code>. Nessun sistema garantisce esito perfetto su dati incoherenti; qui si massimizza correttezza e tracciabilità rispetto a modifiche manuali fuori RPC.
        </Alert>
      ) : null}

      {batchNote ? (
        <Alert tone="success" className="mt-3">
          {batchNote}
        </Alert>
      ) : null}

      {error ? (
        <Alert className="mt-4" tone="danger">
          {error}
        </Alert>
      ) : null}

      {auditTitle ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">{auditTitle}</div>
      ) : null}

      {agentExecLog.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-200/80">Registro esecuzioni agente</div>
          <p className="mt-1 text-[11px] text-white/55">
            Batch whitelist e applicazioni manuali dashboard: lo stesso tool server{' '}
            <code className="text-[10px]">apply_ai_suggestion</code> scrive qui con{' '}
            <code className="text-[10px]">source</code> batch o manuale nei parametri.
          </p>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-xs">
            {agentExecLog.map((row) => (
              <li key={row.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-white/90">{toolLabel(row.tool_name)}</span>
                  <span className="text-[10px] text-white/45">{formatDateTime(row.created_at)}</span>
                </div>
                {typeof row.parameters.action_type === 'string' ? (
                  <div className="mt-1 font-mono text-[10px] text-white/55">{String(row.parameters.action_type)}</div>
                ) : null}
                {typeof row.parameters.source === 'string' ? (
                  <div className="mt-1 text-[10px] text-white/45">Origine: {String(row.parameters.source)}</div>
                ) : null}
                {row.error ? (
                  <div className="mt-1 text-amber-200/90">{row.error}</div>
                ) : row.result?.status === 'applied' ? (
                  <div className="mt-1 text-emerald-200/85">Applicato</div>
                ) : row.tool_name === 'auto_apply_whitelisted_ai_suggestions_finished' &&
                  typeof row.parameters.failure_count === 'number' ? (
                  <div className="mt-1 text-white/60">
                    OK: applicati {String(row.parameters.applied_count ?? '—')}, falliti{' '}
                    {String(row.parameters.failure_count ?? '—')}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-9 w-full animate-pulse rounded-2xl bg-white/5" />
            <div className="mt-2 h-9 w-4/5 animate-pulse rounded-2xl bg-white/5" />
          </div>
        ) : suggestions.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5 text-white/60" />}
            title="Nessun suggerimento ad alta priorità"
            description="Riprova con un filtro diverso oppure rigenera."
            className="p-4"
          />
        ) : (
          suggestions.map((s) => {
            const badge = priorityBadge(s.priority)
            const sb = statusBadge(s.status)
            const evidence = redactEvidenceLinesForUi(asEvidenceList(s.evidence))
            return (
              <div key={s.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">{s.title}</div>
                      <div className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', badge.cls)}>
                        {badge.label}
                      </div>
                      <div className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', sb.cls)}>{sb.label}</div>
                    </div>
                    {s.explanation ? <div className="mt-1 text-sm text-white/70">{s.explanation}</div> : null}
                    {s.expected_impact ? <div className="mt-2 text-xs text-white/60">Impatto: {s.expected_impact}</div> : null}
                    {evidence.length ? (
                      <div className="mt-2 space-y-1 text-xs text-white/60">
                        <div className="text-[10px] text-white/45">
                          Metriche derivate dal gestionale (identificativi tecnici mascherati in interfaccia).
                        </div>
                        {evidence.slice(0, 3).map((t, idx) => (
                          <div key={idx}>• {t}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/suggestions/${encodeURIComponent(s.id)}`}
                      className="tb-btn tb-btn-secondary inline-flex h-9 items-center rounded-xl px-3 text-xs font-semibold"
                    >
                      Scheda completa
                    </Link>
                    {s.status === 'new' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy || backgroundRegenerating}
                        onClick={() => {
                          setBusy(true)
                          setError(null)
                          ;(async () => {
                            try {
                              const { error } = await supabase.rpc('mark_ai_suggestion_read', { p_suggestion_id: s.id })
                              if (error) throw error
                              await refresh()
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
                    {s.status === 'new' || s.status === 'read' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy || backgroundRegenerating}
                        onClick={() => {
                          setBusy(true)
                          setError(null)
                          ;(async () => {
                            try {
                              const { error } = await supabase.rpc('dismiss_ai_suggestion', { p_suggestion_id: s.id })
                              if (error) throw error
                              await refresh()
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
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || backgroundRegenerating || !canApply(s, props.isOwner)}
                      onClick={() => {
                        setBusy(true)
                        setError(null)
                        ;(async () => {
                          try {
                            const { error } = await supabase.rpc('apply_ai_suggestion', { p_suggestion_id: s.id })
                            if (error) throw error
                            await refresh()
                          } catch (e: unknown) {
                            setError(errorMessage(e, 'Impossibile applicare il suggerimento.'))
                          } finally {
                            setBusy(false)
                          }
                        })()
                      }}
                    >
                      {ctaLabel(s.action_type)}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

    </Card>
  )
}
