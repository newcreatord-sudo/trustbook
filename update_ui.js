import fs from 'fs';

const path = 'src/pages/dashboard/BusinessSettingsPanel.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace state variables
content = content.replace(
  /const \[depositEnabled, setDepositEnabled\] = useState<boolean>\(b\.deposit_enabled\).*?const \[depositRiskyThreshold, setDepositRiskyThreshold\] = useState\(String\(b\.deposit_risky_threshold \?\? 60\)\)/s,
  `const [depositMode, setDepositMode] = useState<BusinessRow['deposit_mode']>(b.deposit_mode ?? 'none')
  const [depositValueType, setDepositValueType] = useState<BusinessRow['deposit_value_type']>(b.deposit_value_type ?? 'percentage')
  const [depositFixedCents, setDepositFixedCents] = useState(String(b.deposit_fixed_cents ?? 0))
  const [depositPercent, setDepositPercent] = useState(String(b.deposit_percent ?? 0))
  const [depositMin, setDepositMin] = useState(String(b.deposit_min_cents ?? 0))
  const [depositMax, setDepositMax] = useState(String(b.deposit_max_cents ?? 0))
  
  const [depositGreenType, setDepositGreenType] = useState<BusinessRow['deposit_value_type']>(b.deposit_green_rule?.type ?? 'percentage')
  const [depositGreenValue, setDepositGreenValue] = useState(String(b.deposit_green_rule?.value ?? 0))
  const [depositYellowType, setDepositYellowType] = useState<BusinessRow['deposit_value_type']>(b.deposit_yellow_rule?.type ?? 'percentage')
  const [depositYellowValue, setDepositYellowValue] = useState(String(b.deposit_yellow_rule?.value ?? 20))
  const [depositRedType, setDepositRedType] = useState<BusinessRow['deposit_value_type']>(b.deposit_red_rule?.type ?? 'percentage')
  const [depositRedValue, setDepositRedValue] = useState(String(b.deposit_red_rule?.value ?? 50))
  
  const [manualApprovalForHighRisk, setManualApprovalForHighRisk] = useState(b.manual_approval_for_high_risk ?? true)
  const [cancellationFreeUntilHours, setCancellationFreeUntilHours] = useState(String(b.cancellation_free_until_hours ?? 24))
  const [refundPolicy, setRefundPolicy] = useState<BusinessRow['refund_policy']>(b.refund_policy ?? 'flexible')
  const [depositRetainedOnNoShow, setDepositRetainedOnNoShow] = useState(b.deposit_retained_on_no_show ?? true)
  const [depositRetainedOnLateCancel, setDepositRetainedOnLateCancel] = useState(b.deposit_retained_on_late_cancel ?? true)`
);

// Replace useEffect updates
content = content.replace(
  /setDepositEnabled\(b\.deposit_enabled\).*?setDepositRiskyThreshold\(String\(b\.deposit_risky_threshold \?\? 60\)\)/s,
  `setDepositMode(b.deposit_mode ?? 'none')
    setDepositValueType(b.deposit_value_type ?? 'percentage')
    setDepositFixedCents(String(b.deposit_fixed_cents ?? 0))
    setDepositPercent(String(b.deposit_percent ?? 0))
    setDepositMin(String(b.deposit_min_cents ?? 0))
    setDepositMax(String(b.deposit_max_cents ?? 0))
    setDepositGreenType(b.deposit_green_rule?.type ?? 'percentage')
    setDepositGreenValue(String(b.deposit_green_rule?.value ?? 0))
    setDepositYellowType(b.deposit_yellow_rule?.type ?? 'percentage')
    setDepositYellowValue(String(b.deposit_yellow_rule?.value ?? 20))
    setDepositRedType(b.deposit_red_rule?.type ?? 'percentage')
    setDepositRedValue(String(b.deposit_red_rule?.value ?? 50))
    setManualApprovalForHighRisk(b.manual_approval_for_high_risk ?? true)
    setCancellationFreeUntilHours(String(b.cancellation_free_until_hours ?? 24))
    setRefundPolicy(b.refund_policy ?? 'flexible')
    setDepositRetainedOnNoShow(b.deposit_retained_on_no_show ?? true)
    setDepositRetainedOnLateCancel(b.deposit_retained_on_late_cancel ?? true)`
);

// Replace isDirty
content = content.replace(
  /depositEnabled !== b\.deposit_enabled \|\|.*?depositRiskyThreshold !== String\(b\.deposit_risky_threshold \?\? 60\) \|\|/s,
  `depositMode !== (b.deposit_mode ?? 'none') ||
      depositValueType !== (b.deposit_value_type ?? 'percentage') ||
      depositFixedCents !== String(b.deposit_fixed_cents ?? 0) ||
      depositPercent !== String(b.deposit_percent ?? 0) ||
      depositMin !== String(b.deposit_min_cents ?? 0) ||
      depositMax !== String(b.deposit_max_cents ?? 0) ||
      depositGreenType !== (b.deposit_green_rule?.type ?? 'percentage') ||
      depositGreenValue !== String(b.deposit_green_rule?.value ?? 0) ||
      depositYellowType !== (b.deposit_yellow_rule?.type ?? 'percentage') ||
      depositYellowValue !== String(b.deposit_yellow_rule?.value ?? 20) ||
      depositRedType !== (b.deposit_red_rule?.type ?? 'percentage') ||
      depositRedValue !== String(b.deposit_red_rule?.value ?? 50) ||
      manualApprovalForHighRisk !== (b.manual_approval_for_high_risk ?? true) ||
      cancellationFreeUntilHours !== String(b.cancellation_free_until_hours ?? 24) ||
      refundPolicy !== (b.refund_policy ?? 'flexible') ||
      depositRetainedOnNoShow !== (b.deposit_retained_on_no_show ?? true) ||
      depositRetainedOnLateCancel !== (b.deposit_retained_on_late_cancel ?? true) ||`
);

// Replace isDirty dependencies
content = content.replace(
  /depositEnabled,.*?depositRiskyThreshold,/s,
  `depositMode,
    depositValueType,
    depositFixedCents,
    depositPercent,
    depositMin,
    depositMax,
    depositGreenType,
    depositGreenValue,
    depositYellowType,
    depositYellowValue,
    depositRedType,
    depositRedValue,
    manualApprovalForHighRisk,
    cancellationFreeUntilHours,
    refundPolicy,
    depositRetainedOnNoShow,
    depositRetainedOnLateCancel,`
);

// Replace validation logic
content = content.replace(
  /const depositFixedCents = Math\.max\(0, Math\.floor\(Number\(depositFixed\) \|\| 0\)\).*?if \(depositEnabled && depositAmountMode === 'percent'\) \{\s+if \(depositMaxCents > 0 && depositMinCents > depositMaxCents\) \{\s+return setError\('Min caparra non può superare Max caparra\.'\)\s+\}\s+\}/s,
  `const valFixed = Math.max(0, Math.floor(Number(depositFixedCents) || 0))
            const valPercent = Math.max(0, Math.min(100, Math.floor(Number(depositPercent) || 0)))
            const valMin = Math.max(0, Math.floor(Number(depositMin) || 0))
            const valMax = Math.max(0, Math.floor(Number(depositMax) || 0))
            
            const gVal = Math.max(0, depositGreenType === 'percentage' ? Math.min(100, Math.floor(Number(depositGreenValue)||0)) : Math.floor(Number(depositGreenValue)||0))
            const yVal = Math.max(0, depositYellowType === 'percentage' ? Math.min(100, Math.floor(Number(depositYellowValue)||0)) : Math.floor(Number(depositYellowValue)||0))
            const rVal = Math.max(0, depositRedType === 'percentage' ? Math.min(100, Math.floor(Number(depositRedValue)||0)) : Math.floor(Number(depositRedValue)||0))
            const cfh = Math.max(0, Math.floor(Number(cancellationFreeUntilHours) || 24))

            if (depositMode === 'everyone' || depositMode === 'risk_based') {
              if (depositValueType === 'percentage' && valPercent === 0) {
                return setError('Imposta una percentuale > 0.')
              }
              if (depositValueType === 'fixed_amount' && valFixed === 0) {
                return setError('Imposta una caparra fissa > 0.')
              }
              if (depositValueType === 'percentage' && valMax > 0 && valMin > valMax) {
                return setError('Min caparra non può superare Max caparra.')
              }
            }`
);

// Replace update object logic
content = content.replace(
  /deposit_enabled: depositEnabled,.*?deposit_max_cents:.*?depositMaxCents \|\| null\),/s,
  `deposit_mode: depositMode,
                    deposit_value_type: depositValueType,
                    deposit_fixed_cents: valFixed,
                    deposit_percent: valPercent,
                    deposit_min_cents: valMin || null,
                    deposit_max_cents: valMax || null,
                    deposit_green_rule: { type: depositGreenType, value: gVal },
                    deposit_yellow_rule: { type: depositYellowType, value: yVal },
                    deposit_red_rule: { type: depositRedType, value: rVal },
                    manual_approval_for_high_risk: manualApprovalForHighRisk,
                    cancellation_free_until_hours: cfh,
                    refund_policy: refundPolicy,
                    deposit_retained_on_no_show: depositRetainedOnNoShow,
                    deposit_retained_on_late_cancel: depositRetainedOnLateCancel,`
);

// Replace UI
const uiOld = `<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="tb-kicker">CAPARRA ANTICIPO (STRIPE)</div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Abilitata</div>
            <button
              type="button"
              onClick={() => setDepositEnabled((v) => !v)}
              className={cn(
                'h-8 w-14 rounded-full border transition',
                depositEnabled
                  ? 'border-[#4F7CFF]/50 bg-[#4F7CFF]/30'
                  : 'border-white/10 bg-white/5',
              )}
            >
              <div
                className={cn(
                  'h-7 w-7 translate-x-0.5 rounded-full bg-white/80 transition',
                  depositEnabled && 'translate-x-6',
                )}
              />
            </button>
          </div>

          <div className="mt-3">
            <label className="tb-label">Regola caparra</label>
            <Select
              value={depositEnabled ? depositRule : 'off'}
              onChange={(e) => setDepositRule(e.target.value as BusinessRow['deposit_rule'])}
              disabled={!depositEnabled}
              className={cn('mt-1', !depositEnabled && 'opacity-60')}
            >
              <option value="all">Sempre</option>
              <option value="risky_only">Solo clienti a rischio</option>
              <option value="off">Disattiva</option>
            </Select>
          </div>

          <div className="mt-3">
            <label className="tb-label">Tipo caparra</label>
            <Select
              value={depositAmountMode}
              onChange={(e) => setDepositAmountMode(e.target.value as 'fixed' | 'percent')}
              disabled={!depositEnabled}
              className={cn('mt-1', !depositEnabled && 'opacity-60')}
            >
              <option value="fixed">Fissa</option>
              <option value="percent">Percentuale</option>
            </Select>
          </div>

          <div className="mt-3">
            <label className="tb-label">Soglia rischio (0-100)</label>
            <Input
              value={depositRiskyThreshold}
              onChange={(e) => setDepositRiskyThreshold(e.target.value)}
              inputMode="numeric"
              disabled={!depositEnabled || depositRule !== 'risky_only'}
              className={cn('mt-1', (!depositEnabled || depositRule !== 'risky_only') && 'opacity-60')}
              placeholder="60"
            />
          </div>

          <div className="mt-3">
            <label className="tb-label">Caparra fissa (cent)</label>
            <Input
              value={depositFixed}
              onChange={(e) => setDepositFixed(e.target.value)}
              inputMode="numeric"
              disabled={!depositEnabled || depositAmountMode !== 'fixed'}
              className={cn('mt-1', (!depositEnabled || depositAmountMode !== 'fixed') && 'opacity-60')}
            />
          </div>

          <div className="mt-3">
            <label className="tb-label">Percentuale caparra (0-100)</label>
            <Input
              value={depositPercent}
              onChange={(e) => setDepositPercent(e.target.value)}
              inputMode="numeric"
              disabled={!depositEnabled || depositAmountMode !== 'percent'}
              className={cn('mt-1', (!depositEnabled || depositAmountMode !== 'percent') && 'opacity-60')}
              placeholder="20"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="tb-label">Min caparra (cent)</label>
              <Input
                value={depositMin}
                onChange={(e) => setDepositMin(e.target.value)}
                inputMode="numeric"
                disabled={!depositEnabled || depositAmountMode !== 'percent'}
                className={cn('mt-1', (!depositEnabled || depositAmountMode !== 'percent') && 'opacity-60')}
                placeholder="500"
              />
            </div>
            <div>
              <label className="tb-label">Max caparra (cent)</label>
              <Input
                value={depositMax}
                onChange={(e) => setDepositMax(e.target.value)}
                inputMode="numeric"
                disabled={!depositEnabled || depositAmountMode !== 'percent'}
                className={cn('mt-1', (!depositEnabled || depositAmountMode !== 'percent') && 'opacity-60')}
                placeholder="3000"
              />
            </div>
          </div>

          <div className="mt-3 text-[10px] text-white/60">
            La caparra può essere sempre richiesta o solo per clienti a rischio (con storico basso).
          </div>
        </div>`;

const uiNew = `<div className="rounded-2xl border border-[#4F7CFF]/30 bg-[#4F7CFF]/5 p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#4F7CFF]/10 blur-3xl rounded-full" />
          <div className="tb-kicker text-[#4F7CFF]">PROTEZIONE AGENDA (CAPARRA)</div>
          
          <div className="mt-3">
            <label className="tb-label">Modalità Caparra</label>
            <Select
              value={depositMode}
              onChange={(e) => setDepositMode(e.target.value as BusinessRow['deposit_mode'])}
              className="mt-1 border-[#4F7CFF]/30 focus:border-[#4F7CFF]"
            >
              <option value="none">Nessuna caparra</option>
              <option value="everyone">Tutti i clienti (Garanzia fissa)</option>
              <option value="risk_based">Solo clienti a rischio (Anti No-Show)</option>
              <option value="dynamic">Dinamica (Premiante per clienti affidabili)</option>
            </Select>
            <div className="mt-1 text-[10px] text-white/60">
              Usa la caparra per tutelare il tuo tempo senza scoraggiare le prenotazioni.
            </div>
          </div>

          {depositMode !== 'none' && (
            <>
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="tb-kicker mb-2">REGOLE BASE</div>
                {(depositMode === 'everyone' || depositMode === 'risk_based') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="tb-label">Tipo valore</label>
                      <Select
                        value={depositValueType}
                        onChange={(e) => setDepositValueType(e.target.value as BusinessRow['deposit_value_type'])}
                        className="mt-1"
                      >
                        <option value="percentage">Percentuale</option>
                        <option value="fixed_amount">Cifra fissa (cent)</option>
                      </Select>
                    </div>
                    {depositValueType === 'percentage' ? (
                      <div>
                        <label className="tb-label">Percentuale (0-100)</label>
                        <Input
                          value={depositPercent}
                          onChange={(e) => setDepositPercent(e.target.value)}
                          inputMode="numeric"
                          className="mt-1"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="tb-label">Cifra fissa (cent)</label>
                        <Input
                          value={depositFixedCents}
                          onChange={(e) => setDepositFixedCents(e.target.value)}
                          inputMode="numeric"
                          className="mt-1"
                        />
                      </div>
                    )}
                  </div>
                )}

                {depositMode === 'dynamic' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <div className="text-xs font-semibold text-emerald-500">Clienti Affidabili (Verdi)</div>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={depositGreenType}
                          onChange={(e) => setDepositGreenType(e.target.value as BusinessRow['deposit_value_type'])}
                          className="flex-1"
                        >
                          <option value="percentage">%</option>
                          <option value="fixed_amount">Fissa (cent)</option>
                        </Select>
                        <Input
                          value={depositGreenValue}
                          onChange={(e) => setDepositGreenValue(e.target.value)}
                          inputMode="numeric"
                          className="w-24"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                        <div className="text-xs font-semibold text-amber-500">Rischio Medio (Gialli)</div>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={depositYellowType}
                          onChange={(e) => setDepositYellowType(e.target.value as BusinessRow['deposit_value_type'])}
                          className="flex-1"
                        >
                          <option value="percentage">%</option>
                          <option value="fixed_amount">Fissa (cent)</option>
                        </Select>
                        <Input
                          value={depositYellowValue}
                          onChange={(e) => setDepositYellowValue(e.target.value)}
                          inputMode="numeric"
                          className="w-24"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <div className="text-xs font-semibold text-red-500">Rischio Alto (Rossi o Sconosciuti)</div>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={depositRedType}
                          onChange={(e) => setDepositRedType(e.target.value as BusinessRow['deposit_value_type'])}
                          className="flex-1"
                        >
                          <option value="percentage">%</option>
                          <option value="fixed_amount">Fissa (cent)</option>
                        </Select>
                        <Input
                          value={depositRedValue}
                          onChange={(e) => setDepositRedValue(e.target.value)}
                          inputMode="numeric"
                          className="w-24"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="tb-kicker mb-2">PROTEZIONI AGGIUNTIVE</div>
                
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <div className="text-sm text-white">Approvazione manuale per alto rischio</div>
                    <div className="text-[10px] text-white/60">Controlla e accetta a mano gli utenti meno affidabili.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualApprovalForHighRisk((v) => !v)}
                    className={cn(
                      'h-6 w-10 rounded-full border transition',
                      manualApprovalForHighRisk ? 'border-[#4F7CFF]/50 bg-[#4F7CFF]/30' : 'border-white/10 bg-white/5'
                    )}
                  >
                    <div className={cn('h-5 w-5 translate-x-0.5 rounded-full bg-white/80 transition', manualApprovalForHighRisk && 'translate-x-4')} />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div>
                    <div className="text-sm text-white">Trattieni su No-Show</div>
                    <div className="text-[10px] text-white/60">La caparra non viene rimborsata se il cliente non si presenta.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDepositRetainedOnNoShow((v) => !v)}
                    className={cn(
                      'h-6 w-10 rounded-full border transition',
                      depositRetainedOnNoShow ? 'border-[#4F7CFF]/50 bg-[#4F7CFF]/30' : 'border-white/10 bg-white/5'
                    )}
                  >
                    <div className={cn('h-5 w-5 translate-x-0.5 rounded-full bg-white/80 transition', depositRetainedOnNoShow && 'translate-x-4')} />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div>
                    <div className="text-sm text-white">Trattieni su Late-Cancel</div>
                    <div className="text-[10px] text-white/60">La caparra viene trattenuta se si cancella oltre il limite consentito.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDepositRetainedOnLateCancel((v) => !v)}
                    className={cn(
                      'h-6 w-10 rounded-full border transition',
                      depositRetainedOnLateCancel ? 'border-[#4F7CFF]/50 bg-[#4F7CFF]/30' : 'border-white/10 bg-white/5'
                    )}
                  >
                    <div className={cn('h-5 w-5 translate-x-0.5 rounded-full bg-white/80 transition', depositRetainedOnLateCancel && 'translate-x-4')} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>`;

content = content.replace(uiOld, uiNew);

fs.writeFileSync(path, content, 'utf8');
console.log('Done rewriting BusinessSettingsPanel.tsx');