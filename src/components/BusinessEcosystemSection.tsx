import { useEffect, useState } from 'react'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'
import type { BusinessRow } from '@/domain/supabase'
import { errorMessage } from '@/lib/errors'
import type { BusinessFeatureGate } from '@/lib/subscriptions'
import {
  fetchBusinessBookingEcosystem,
  upsertBusinessBookingEcosystem,
  type AiExecutionMode,
  type BookingVertical,
  type BusinessBookingEcosystemRow,
} from '@/lib/businessEcosystem'
import FloorPlanManager from './FloorPlanManager'
import {
  AI_BATCH_AUTOMATIC_ALLOWED_ACTION_IDS,
  AI_SUGGESTION_ACTION_TYPE_OPTIONS,
} from '@/lib/aiSuggestionActionTypes'
import {
  playbookList,
  suggestedArchetypeFromCategory,
  VERTICAL_PLAYBOOKS,
  type VerticalArchetypeId,
} from '@/lib/verticalPlaybooks'

export default function BusinessEcosystemSection(props: {
  business: BusinessRow
  featureGate: BusinessFeatureGate
  floorPlanInitialTab?: 'plans' | 'editor' | 'resources' | null
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [row, setRow] = useState<BusinessBookingEcosystemRow | null>(null)
  const [vertical, setVertical] = useState<BookingVertical>('service')
  const [resourceMgmt, setResourceMgmt] = useState(false)
  const [noShowSuite, setNoShowSuite] = useState(false)
  const [baselinePct, setBaselinePct] = useState('')
  const [targetPct, setTargetPct] = useState('1')
  const [strictAi, setStrictAi] = useState(true)
  const [aiExecutionMode, setAiExecutionMode] = useState<AiExecutionMode>('assist')
  const [aiAutoTypes, setAiAutoTypes] = useState<string[]>([])
  const [aiNotesEnabled, setAiNotesEnabled] = useState(false)
  const [aiFloorPlanReadEnabled, setAiFloorPlanReadEnabled] = useState(false)
  const [aiTableAssignmentEnabled, setAiTableAssignmentEnabled] = useState(false)
  const [aiBlockedSlotsEnabled, setAiBlockedSlotsEnabled] = useState(false)
  const [aiBookingOperatorEnabled, setAiBookingOperatorEnabled] = useState(false)
  const [customerTableChoice, setCustomerTableChoice] = useState<'off' | 'preferred' | 'required'>('preferred')
  const [defaultTableAssignmentMode, setDefaultTableAssignmentMode] = useState<'auto' | 'customer_choice'>('auto')
  const [resourcePrimaryKind, setResourcePrimaryKind] = useState<'table' | 'station' | 'seat'>('table')
  const [publicFloorPlanEnabled, setPublicFloorPlanEnabled] = useState(false)
  const [notes, setNotes] = useState('')
  const [playbookId, setPlaybookId] = useState<VerticalArchetypeId>(() =>
    suggestedArchetypeFromCategory(props.business.category),
  )

  useEffect(() => {
    setPlaybookId(suggestedArchetypeFromCategory(props.business.category))
  }, [props.business.category])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const r = await fetchBusinessBookingEcosystem(props.business.id)
        if (!mounted) return
        setRow(r)
        if (r) {
          setVertical(r.booking_vertical)
          setResourceMgmt(r.resource_management_enabled)
          setNoShowSuite(r.no_show_suite_enabled)
          setBaselinePct(r.baseline_no_show_rate_pct !== null ? String(r.baseline_no_show_rate_pct) : '')
          setTargetPct(String(r.target_no_show_rate_pct ?? 1))
          setStrictAi(r.ai_strict_confirmation_required)
          setAiExecutionMode(r.ai_execution_mode ?? 'assist')
          setAiAutoTypes(Array.isArray(r.ai_auto_action_types) ? [...r.ai_auto_action_types] : [])
          setAiNotesEnabled(Boolean(r.ai_notes_enabled))
          setAiFloorPlanReadEnabled(Boolean(r.ai_floor_plan_read_enabled))
          setAiTableAssignmentEnabled(Boolean(r.ai_table_assignment_enabled))
          setAiBlockedSlotsEnabled(Boolean(r.ai_blocked_slots_enabled))
          setAiBookingOperatorEnabled(Boolean(r.ai_booking_operator_enabled))
          setCustomerTableChoice(r.customer_table_choice ?? 'preferred')
          setDefaultTableAssignmentMode(r.default_table_assignment_mode ?? 'auto')
          const p = r.settings?.resource_primary_kind
          const fallback = r.booking_vertical === 'professional_slot' ? 'station' : r.booking_vertical === 'seat_assignment' ? 'seat' : 'table'
          setResourcePrimaryKind(p === 'station' || p === 'seat' || p === 'table' ? p : fallback)
          const pub = r.settings?.public_floor_plan_enabled
          setPublicFloorPlanEnabled(pub === true)
          setNotes(r.ecosystem_notes ?? '')
        }
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento ecosistema.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [props.business.id])

  const gateSuite = props.featureGate.noShowSuite !== false
  const gateRes = props.featureGate.resourceManagement !== false

  const onSave = () => {
    setError(null)
    setOk(null)
    const baseline =
      baselinePct.trim() === '' ? null : Math.min(100, Math.max(0, Number(baselinePct)))
    const target = Math.min(100, Math.max(0, Number(targetPct)))
    if (baselinePct.trim() !== '' && !Number.isFinite(baseline)) {
      setError('Baseline no-show non valida (usa numero 0–100).')
      return
    }
    if (!Number.isFinite(target)) {
      setError('Target no-show non valido.')
      return
    }

    if (aiExecutionMode === 'auto_whitelisted' && strictAi) {
      setError(
        'Per il batch automatico devi disattivare «Richiedi sempre conferma umana» oppure scegliere «Solo assistenza».',
      )
      return
    }

    const allowedActionIds = new Set<string>(AI_BATCH_AUTOMATIC_ALLOWED_ACTION_IDS)
    if (aiAutoTypes.some((t) => !allowedActionIds.has(t))) {
      setError('Whitelist agente: rimuovi tipi azione non supportati (devono coincidere con i tipi server).')
      return
    }

    const effectiveResource = gateRes ? resourceMgmt : false
    const effectiveSuite = gateSuite ? noShowSuite : false

    setSaving(true)
    ;(async () => {
      try {
        await upsertBusinessBookingEcosystem({
          business_id: props.business.id,
          booking_vertical: vertical,
          resource_management_enabled: effectiveResource,
          no_show_suite_enabled: effectiveSuite,
          baseline_no_show_rate_pct: baseline,
          target_no_show_rate_pct: target,
          ai_strict_confirmation_required: strictAi,
          ai_execution_mode: aiExecutionMode,
          ai_auto_action_types: aiAutoTypes,
          ai_notes_enabled: aiNotesEnabled,
          ai_floor_plan_read_enabled: aiFloorPlanReadEnabled,
          ai_table_assignment_enabled: aiTableAssignmentEnabled,
          ai_blocked_slots_enabled: aiBlockedSlotsEnabled,
          ai_booking_operator_enabled: aiBookingOperatorEnabled,
          customer_table_choice: customerTableChoice,
          default_table_assignment_mode: defaultTableAssignmentMode,
          ecosystem_notes: notes.trim() || null,
          settings: {
            ...(row?.settings ?? {}),
            resource_primary_kind: resourcePrimaryKind,
            public_floor_plan_enabled: publicFloorPlanEnabled,
          },
        })
        setOk('Salvato. Le modifiche ai tavoli/slot si integrano gradualmente col motore prenotazioni.')
      } catch (e: unknown) {
        setError(errorMessage(e, 'Errore salvataggio.'))
      } finally {
        setSaving(false)
      }
    })()
  }

  return (
    <Card padded={false} className="mt-6 border-white/10 bg-white/[0.02] p-5">
      <div className="tb-kicker">ECOSISTEMA PRENOTAZIONI</div>
      <div className="mt-1 text-sm font-semibold text-white">Verticalità, risorse (tavoli/sedute/postazioni) e metriche no-show</div>
      <div className="mt-2 text-xs text-white/60">
        Il confronto “prima vs dopo” richiede una baseline dichiarata (es. storico locale). Target indicativo predefinito 1%: va monitorato con KPI dashboard —{' '}
        <span className="text-white/80">nessun sistema garantisce matematicamente un tasso senza contesto operativo.</span>
      </div>

      <Alert tone="info" className="mt-4">
        <div className="text-sm font-semibold text-white">Garanzie realistiche (non marketing)</div>
        <div className="mt-2 space-y-2 text-xs text-white/75 leading-relaxed">
          <p>
            <span className="text-white/90">TrustBook garantisce</span> validazione deterministica lato server (slot, sovrapposizioni allineate al motore,
            aperture/chiusure, staff, blocchi, ripianificazioni tramite RPC dedicate), tracciabilità eventi dove configurata e policy depositi applicate dal motore.
          </p>
          <p>
            <span className="text-white/90">TrustBook non garantisce</span> riempimento agenda, fatturato, reputazione online, conformità normativa al posto tuo né integrazioni esterne non cablate nel tenant.
          </p>
        </div>
      </Alert>

      {!gateSuite || !gateRes ? (
        <Alert tone="info" className="mt-4">
          Alcune opzioni sono legate al piano abbonamento (suite no-show / gestione risorse). Valori non inclusi nel piano restano disattivi finché non si aggiorna il piano.
        </Alert>
      ) : null}

      <Alert tone="danger" className="mt-4">
        <strong>AI e sicurezza:</strong> nessun agente garantisce «zero errori». TrustBook riduce il rischio obbligando mutazioni sensibili a passare da RPC server-side (
        <code className="text-xs">create_booking_v3</code>,{' '}
        <code className="text-xs">create_booking_v3_with_resource_assignment</code> per sala/postazione atomica, transizioni stato, suggerimenti tramite{' '}
        <code className="text-xs">apply_ai_suggestion</code>). Il batch automatico (
        <code className="text-xs">auto_apply_whitelisted_ai_suggestions</code>) è consentito solo se disattivi la conferma stretta e definisci una whitelist limitata di tipi azione.
        Batch whitelist e applicazioni manuali dashboard sono tracciate in{' '}
        <code className="text-xs">ai_agent_execution_log</code> (pannello suggerimenti AI); i tool HTTP director usano gli RPC{' '}
        <code className="text-xs">ai_*</code> con flag dedicati qui sotto. Operatore agenda (lista/approva/rifiuta/riprogramma/chiusure): RPC{' '}
        <code className="text-xs">ai_list_business_bookings</code> ecc. e route{' '}
        <code className="text-xs">/api/ai-tools/bookings/*</code> quando «AI operatore prenotazioni» è attivo.
      </Alert>

      <Alert tone="info" className="mt-4">
        <strong>Planimetria:</strong> in TrustBook le mappe sala/tavoli vivono in <code className="text-xs">business_floor_plans.layout_json</code> e nelle risorse collegate.
        Renova 3D è un progetto separato: qui non c&apos;è sincronizzazione automatica; eventuale export/import è manuale o va progettato come integrazione dedicata.
      </Alert>

      {loading ? (
        <div className="mt-4 text-sm text-white/60">Carico impostazioni ecosistema…</div>
      ) : (
        <div className="mt-4 space-y-4">
          {error ? (
            <Alert tone="danger">{error}</Alert>
          ) : null}
          {ok ? (
            <Alert tone="success">{ok}</Alert>
          ) : null}

          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#4F7CFF]">Playbook per verticalità</div>
            <div className="mt-2 text-xs text-white/65">
              Categoria nel profilo attività: <span className="font-medium text-white">{props.business.category}</span>. Abbiamo pre-selezionato un playbook coerente;
              puoi cambiarlo se il tuo modello è diverso.
            </div>
            <Select
              value={playbookId}
              onChange={(e) => setPlaybookId(e.target.value as VerticalArchetypeId)}
              className="mt-3"
              aria-label="Playbook verticale"
            >
              {playbookList().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            {(() => {
              const pb = VERTICAL_PLAYBOOKS[playbookId]
              return (
                <>
                  <p className="mt-3 text-xs text-white/70 leading-relaxed">{pb.summary}</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-white/65">
                    {pb.checklist.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  <Alert tone="warning" className="mt-3">
                    <strong>Perimetro garanzia per questo vertical:</strong> {pb.guaranteeScope}
                  </Alert>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3"
                    disabled={saving}
                    onClick={() => {
                      setError(null)
                      setOk(null)
                      const p = VERTICAL_PLAYBOOKS[playbookId]
                      setVertical(p.bookingVertical)
                      if (gateRes && p.resourceManagementRecommended) setResourceMgmt(true)
                      setOk(
                        `Playbook «${p.shortLabel}» applicato ai campi qui sotto (verticalità${p.resourceManagementRecommended ? ' + gestione risorse suggerita' : ''}). Premi «Salva ecosistema» per persistere.`,
                      )
                    }}
                  >
                    Applica playbook ai campi ecosistema
                  </Button>
                </>
              )
            })()}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Modalità operativa</div>
            <Select
              value={vertical}
              onChange={(e) => setVertical(e.target.value as BookingVertical)}
              className="mt-2"
            >
              <option value="service">Servizio a tempo (saloni, studi, officine)</option>
              <option value="hospitality_table">Ospitalità — tavoli / sala</option>
              <option value="seat_assignment">Postazioni sedute numerate</option>
              <option value="professional_slot">Slot professionale (consulenze)</option>
            </Select>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={gateRes ? resourceMgmt : false}
              disabled={!gateRes}
              onChange={(e) => setResourceMgmt(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="text-sm font-medium text-white">Gestione risorse (tavoli, stanze, postazioni)</span>
              <span className="mt-0.5 block text-xs text-white/55">
                Planimetrie TrustBook (<code className="text-[10px]">layout_json</code>): assegnazione tavolo tramite RPC{' '}
                <code className="text-[10px]">set_booking_primary_resource</code>. Nessun legame con Renova 3D.
              </span>
            </span>
          </label>

          {(resourceMgmt && gateRes) && (
            <div className="ml-6 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs font-semibold text-white/60">Planimetria e scelta cliente</div>
              <div>
                <div className="mb-1 text-xs text-white/50">Tipo risorsa principale</div>
                <Select
                  value={resourcePrimaryKind}
                  onChange={(e) => setResourcePrimaryKind(e.target.value as typeof resourcePrimaryKind)}
                  className="w-full"
                >
                  <option value="table">Tavoli</option>
                  <option value="station">Postazioni</option>
                  <option value="seat">Posti a sedere</option>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-xs text-white/50">Il cliente può scegliere la posizione</div>
                <Select
                  value={customerTableChoice}
                  onChange={(e) => setCustomerTableChoice(e.target.value as 'off' | 'preferred' | 'required')}
                  className="w-full"
                >
                  <option value="off">Disattivata — il sistema assegna automaticamente</option>
                  <option value="preferred">Preferita — il cliente può scegliere ma non obbligatorio</option>
                  <option value="required">Richiesta — il cliente deve obbligatoriamente scegliere</option>
                </Select>
              </div>
              {customerTableChoice === 'preferred' && (
                <div>
                  <div className="mb-1 text-xs text-white/50">Assegnazione automatica se il cliente non sceglie</div>
                  <Select
                    value={defaultTableAssignmentMode}
                    onChange={(e) => setDefaultTableAssignmentMode(e.target.value as 'auto' | 'customer_choice')}
                    className="w-full"
                  >
                    <option value="auto">Auto — il sistema assegna il primo disponibile</option>
                    <option value="customer_choice">Attendi — lascia scegliere al cliente</option>
                  </Select>
                </div>
              )}
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={publicFloorPlanEnabled}
                  onChange={(e) => setPublicFloorPlanEnabled(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="text-sm font-medium text-white">Planimetria nel profilo pubblico</span>
                  <span className="mt-0.5 block text-xs text-white/55">
                    Mostra layout e posizioni sul profilo pubblico (solo lettura). Non mostra disponibilità live né occupazione. In{' '}
                    <strong className="text-white/70">Impostazioni attività</strong>, sezione «Profilo pubblico», deve restare attiva anche «Sezione planimetria».
                  </span>
                </span>
              </label>
            </div>
          )}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={gateSuite ? noShowSuite : false}
              disabled={!gateSuite}
              onChange={(e) => setNoShowSuite(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="text-sm font-medium text-white">Suite anti no-show (monitoraggio + policy correlate)</span>
              <span className="mt-0.5 block text-xs text-white/55">
                Si integra con caparra, affidabilità e reminder già presenti nel prodotto.
              </span>
            </span>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-white/60">Baseline no-show % (autovalutazione pre-TrustBook)</div>
              <Input value={baselinePct} onChange={(e) => setBaselinePct(e.target.value)} placeholder="es. 8.5" inputMode="decimal" />
            </div>
            <div>
              <div className="text-xs text-white/60">Target indicativo % (allerta KPI)</div>
              <Input value={targetPct} onChange={(e) => setTargetPct(e.target.value)} placeholder="1" inputMode="decimal" />
            </div>
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" checked={strictAi} onChange={(e) => setStrictAi(e.target.checked)} className="mt-1" />
            <span>
              <span className="text-sm font-medium text-white">Richiedi sempre conferma umana per applicare i suggerimenti AI</span>
              <span className="mt-0.5 block text-xs text-white/55">
                Se attivo, il batch automatico server è bloccato (solo click singolo «Applica»). Consigliato in produzione.
              </span>
            </span>
          </label>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Politica agente (server)</div>
            <Select
              value={aiExecutionMode}
              onChange={(e) => setAiExecutionMode(e.target.value as AiExecutionMode)}
              className="mt-2"
            >
              <option value="assist">Solo assistenza — applicazione solo manuale</option>
              <option value="auto_whitelisted">
                Batch automatico — solo tipi azione in whitelist (richiede conferma stretta disattiva)
              </option>
            </Select>
            <div className="mt-2 text-xs text-white/55">
              Disponibilità on/off si gestisce con slot bloccati tramite RPC{' '}
              <code className="text-[10px]">business_upsert_blocked_slot</code> / <code className="text-[10px]">business_delete_blocked_slot</code>{' '}
              (solo owner): pronte per essere richiamate da un orchestratore esterno che rispetti questa policy.
            </div>
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" checked={aiNotesEnabled} onChange={(e) => setAiNotesEnabled(e.target.checked)} className="mt-1" />
            <span>
              <span className="text-sm font-medium text-white">Direttore AI: appunti operativi attività</span>
              <span className="mt-0.5 block text-xs text-white/55">
                Se attivo, i tool AI autorizzati possono creare/aggiornare note operative (audit in <code className="text-[10px]">ai_agent_execution_log</code>).
              </span>
            </span>
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <input type="checkbox" checked={aiFloorPlanReadEnabled} onChange={(e) => setAiFloorPlanReadEnabled(e.target.checked)} className="mt-1" />
              <span>
                <span className="text-sm font-medium text-white">AI: leggi planimetria</span>
                <span className="mt-0.5 block text-xs text-white/55">Consente bundle planimetria + tavoli per suggerimenti.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <input type="checkbox" checked={aiTableAssignmentEnabled} onChange={(e) => setAiTableAssignmentEnabled(e.target.checked)} className="mt-1" />
              <span>
                <span className="text-sm font-medium text-white">AI: assegna tavoli</span>
                <span className="mt-0.5 block text-xs text-white/55">Consente assegnazione/auto-assegnazione tavolo su booking.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <input type="checkbox" checked={aiBlockedSlotsEnabled} onChange={(e) => setAiBlockedSlotsEnabled(e.target.checked)} className="mt-1" />
              <span>
                <span className="text-sm font-medium text-white">AI: blocchi agenda</span>
                <span className="mt-0.5 block text-xs text-white/55">Consente creare/rimuovere blocchi slot (agenda).</span>
              </span>
            </label>
          </div>

          <label className="mt-3 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <input
              type="checkbox"
              checked={aiBookingOperatorEnabled}
              onChange={(e) => setAiBookingOperatorEnabled(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="text-sm font-medium text-white">AI operatore prenotazioni (agenda)</span>
              <span className="mt-0.5 block text-xs text-white/55">
                Abilita i tool director su lista prenotazioni, dettaglio, approvazione/rifiuto richieste, riprogrammazione diretta o proposta al cliente,
                accetta/rifiuta cambio orario, completa e no-show (team attività con flag). Annullamento con rimborso caparra:{' '}
                <code className="text-[10px]">POST /api/ai-tools/bookings/cancel-by-business</code> (stesso motore di{' '}
                <code className="text-[10px]">/api/stripe/deposit/cancel-by-business</code>). No-show con caparra pagata: dopo la RPC si allinea anche il record pagamento; in alternativa{' '}
                <code className="text-[10px]">forfeit-by-business</code> come in dashboard.
              </span>
            </span>
          </label>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Whitelist azioni batch</div>
            <div className="mt-1 text-xs text-white/55">
              Solo i tipi selezionati possono essere applicati da <code className="text-[10px]">auto_apply_whitelisted_ai_suggestions</code>.
            </div>
            <div className="mt-3 space-y-2">
              {AI_SUGGESTION_ACTION_TYPE_OPTIONS.map((opt) => (
                <label key={opt.id} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={aiAutoTypes.includes(opt.id)}
                    onChange={() =>
                      setAiAutoTypes((prev) =>
                        prev.includes(opt.id) ? prev.filter((x) => x !== opt.id) : [...prev, opt.id],
                      )
                    }
                  />
                  <span>
                    <span className="text-sm text-white">{opt.label}</span>
                    <span className="ml-2 font-mono text-[10px] text-white/45">{opt.id}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-white/60">Note interne ecosistema</div>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. due turni sala, cucina pacing…" />
          </div>

          <Button type="button" variant="primary" disabled={saving} onClick={onSave}>
            {saving ? 'Salvataggio…' : 'Salva ecosistema'}
          </Button>

          {row && (
            <div className="mt-6 border-t border-white/10 pt-6">
              <FloorPlanManager businessId={props.business.id} ecosystem={row} initialTab={props.floorPlanInitialTab ?? null} />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
