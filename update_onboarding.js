import fs from 'fs';

const path = 'src/pages/onboarding/BusinessOnboarding.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace form interface
content = content.replace(
  /depositEnabled: boolean.*?depositMax: string/s,
  `depositMode: 'none' | 'everyone' | 'risk_based' | 'dynamic'
  depositValueType: 'percentage' | 'fixed_amount'
  depositFixedCents: string
  depositPercent: string
  depositMin: string
  depositMax: string
  depositGreenType: 'percentage' | 'fixed_amount'
  depositGreenValue: string
  depositYellowType: 'percentage' | 'fixed_amount'
  depositYellowValue: string
  depositRedType: 'percentage' | 'fixed_amount'
  depositRedValue: string
  manualApprovalForHighRisk: boolean
  cancellationFreeUntilHours: string
  refundPolicy: 'flexible' | 'moderate' | 'strict' | 'non_refundable'
  depositRetainedOnNoShow: boolean
  depositRetainedOnLateCancel: boolean`
);

// Replace validations
content = content.replace(
  /if \(form\.depositEnabled\) \{.*?\}\s+\}/s,
  `if (form.depositMode === 'everyone' || form.depositMode === 'risk_based') {
      if (form.depositValueType === 'percentage') {
        const p = Number(form.depositPercent)
        if (!Number.isFinite(p) || p <= 0 || p > 100) e.depositPercent = 'Percentuale 1–100.'
        const minC = Number(form.depositMin)
        const maxC = Number(form.depositMax)
        if (Number.isFinite(minC) && minC < 0) e.depositMin = 'Min >= 0.'
        if (Number.isFinite(maxC) && maxC < 0) e.depositMax = 'Max >= 0.'
        if (Number.isFinite(minC) && Number.isFinite(maxC) && maxC > 0 && minC > maxC) {
          e.depositMin = 'Min non può superare Max.'
        }
      } else {
        const f = Number(form.depositFixedCents)
        if (!Number.isFinite(f) || f <= 0) e.depositFixedCents = 'Caparra fissa deve essere > 0.'
      }
    }`
);

// Replace initial state
content = content.replace(
  /depositEnabled: true,.*?depositMax: '3000',/s,
  `depositMode: 'risk_based',
    depositValueType: 'percentage',
    depositFixedCents: '500',
    depositPercent: '20',
    depositMin: '500',
    depositMax: '3000',
    depositGreenType: 'percentage',
    depositGreenValue: '0',
    depositYellowType: 'percentage',
    depositYellowValue: '20',
    depositRedType: 'percentage',
    depositRedValue: '50',
    manualApprovalForHighRisk: true,
    cancellationFreeUntilHours: '24',
    refundPolicy: 'flexible',
    depositRetainedOnNoShow: true,
    depositRetainedOnLateCancel: true,`
);

// Second occurrence of initial state
content = content.replace(
  /depositEnabled: true,\s*depositRule: 'risky_only',\s*depositRiskyThreshold: '60',\s*depositAmountMode: 'fixed',\s*depositFixed: '500',\s*depositPercent: '20',\s*depositMin: '500',\s*depositMax: '3000',/s,
  `depositMode: 'risk_based',
                depositValueType: 'percentage',
                depositFixedCents: '500',
                depositPercent: '20',
                depositMin: '500',
                depositMax: '3000',
                depositGreenType: 'percentage',
                depositGreenValue: '0',
                depositYellowType: 'percentage',
                depositYellowValue: '20',
                depositRedType: 'percentage',
                depositRedValue: '50',
                manualApprovalForHighRisk: true,
                cancellationFreeUntilHours: '24',
                refundPolicy: 'flexible',
                depositRetainedOnNoShow: true,
                depositRetainedOnLateCancel: true,`
);

// Replace logic in submit
content = content.replace(
  /const fixedCents = Math\.max\(0, Math\.floor\(Number\(form\.depositFixed\) \|\| 0\)\).*?depositMaxCents: maxCents,/s,
  `const valFixed = Math.max(0, Math.floor(Number(form.depositFixedCents) || 0))
                      const valPercent = Math.max(0, Math.min(100, Math.floor(Number(form.depositPercent) || 0)))
                      const valMin = Math.max(0, Math.floor(Number(form.depositMin) || 0))
                      const valMax = Math.max(0, Math.floor(Number(form.depositMax) || 0))
                      
                      const gVal = Math.max(0, form.depositGreenType === 'percentage' ? Math.min(100, Math.floor(Number(form.depositGreenValue)||0)) : Math.floor(Number(form.depositGreenValue)||0))
                      const yVal = Math.max(0, form.depositYellowType === 'percentage' ? Math.min(100, Math.floor(Number(form.depositYellowValue)||0)) : Math.floor(Number(form.depositYellowValue)||0))
                      const rVal = Math.max(0, form.depositRedType === 'percentage' ? Math.min(100, Math.floor(Number(form.depositRedValue)||0)) : Math.floor(Number(form.depositRedValue)||0))
                      const cfh = Math.max(0, Math.floor(Number(form.cancellationFreeUntilHours) || 24))
                      
                      if (form.depositMode === 'everyone' || form.depositMode === 'risk_based') {
                        if (form.depositValueType === 'fixed_amount' && valFixed === 0) {
                          setLocalError('Imposta una caparra fissa > 0 oppure scegli percentuale.')
                          setSaving(false)
                          return
                        }
                        if (form.depositValueType === 'percentage' && valPercent === 0) {
                          setLocalError('Imposta una percentuale > 0 oppure scegli fissa.')
                          setSaving(false)
                          return
                        }
                      }

                      const created = await createBusinessWithDefaults({
                          name: form.name.trim(),
                          category: form.category,
                          description: form.description.trim() || null,
                          phone: form.phone.trim() || null,
                          email: form.email.trim() || null,
                          website: form.website.trim() || null,
                          addressText: form.addressText.trim() || null,
                          city: form.city.trim() || null,
                          postalCode: form.postalCode.trim() || null,
                          lat: latNum,
                          lng: lngNum,
                          logoUrl: form.logoUrl.trim() || null,
                          galleryUrls,
                          isPaused: form.isPaused,
                          approvalMode: form.approvalMode,
                          requiredReliabilityMin: Math.max(0, Math.min(100, Math.floor(Number(form.requiredReliabilityMin) || 0))),
                          cancellationWindowMin: Math.max(0, Math.floor(Number(form.cancellationWindowMin) || 0)),
                          minGapMin: Math.max(0, Math.floor(Number(form.minGapMin) || 0)),
                          depositMode: form.depositMode,
                          depositValueType: form.depositValueType,
                          depositFixedCents: valFixed,
                          depositPercent: valPercent,
                          depositMinCents: valMin || null,
                          depositMaxCents: valMax || null,
                          depositGreenRule: { type: form.depositGreenType, value: gVal },
                          depositYellowRule: { type: form.depositYellowType, value: yVal },
                          depositRedRule: { type: form.depositRedType, value: rVal },
                          manualApprovalForHighRisk: form.manualApprovalForHighRisk,
                          cancellationFreeUntilHours: cfh,
                          refundPolicy: form.refundPolicy,
                          depositRetainedOnNoShow: form.depositRetainedOnNoShow,
                          depositRetainedOnLateCancel: form.depositRetainedOnLateCancel,`
);

// We need to write the new JSX for the caparra section.
// The file has a case 4 for caparra.

const jsxOldRegex = /<div className="grid grid-cols-1 gap-6 md:grid-cols-2">.*?Se attiva, richiedi caparra/s;
const jsxOldFullRegex = /case 4:[\s\S]*?(?=case 5:)/;

let jsxOldMatch = content.match(jsxOldFullRegex);

if (jsxOldMatch) {
  const replacementJSX = `case 4:
            return (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[#4F7CFF]/30 bg-[#4F7CFF]/5 p-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#4F7CFF]/10 blur-3xl rounded-full" />
                  <div className="tb-kicker text-[#4F7CFF]">PROTEZIONE AGENDA</div>
                  
                  <div className="mt-3">
                    <label className="tb-label">Modalità Caparra</label>
                    <Select
                      value={form.depositMode}
                      onChange={(e) => updateForm({ depositMode: e.target.value as any })}
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

                  {form.depositMode !== 'none' && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <div className="tb-kicker mb-2">REGOLE BASE</div>
                      {(form.depositMode === 'everyone' || form.depositMode === 'risk_based') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="tb-label">Tipo valore</label>
                            <Select
                              value={form.depositValueType}
                              onChange={(e) => updateForm({ depositValueType: e.target.value as any })}
                              className="mt-1"
                            >
                              <option value="percentage">Percentuale</option>
                              <option value="fixed_amount">Cifra fissa (cent)</option>
                            </Select>
                          </div>
                          {form.depositValueType === 'percentage' ? (
                            <div>
                              <label className="tb-label">Percentuale (0-100)</label>
                              <Input
                                value={form.depositPercent}
                                onChange={(e) => updateForm({ depositPercent: e.target.value })}
                                inputMode="numeric"
                                className="mt-1"
                                error={errors.depositPercent}
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="tb-label">Cifra fissa (cent)</label>
                              <Input
                                value={form.depositFixedCents}
                                onChange={(e) => updateForm({ depositFixedCents: e.target.value })}
                                inputMode="numeric"
                                className="mt-1"
                                error={errors.depositFixedCents}
                              />
                            </div>
                          )}
                        </div>
                      )}
                      
                      {form.depositMode === 'dynamic' && (
                        <div className="space-y-3 mt-3">
                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-2 w-2 rounded-full bg-emerald-500" />
                              <div className="text-xs font-semibold text-emerald-500">Clienti Affidabili (Verdi)</div>
                            </div>
                            <div className="flex gap-2">
                              <Select
                                value={form.depositGreenType}
                                onChange={(e) => updateForm({ depositGreenType: e.target.value as any })}
                                className="flex-1"
                              >
                                <option value="percentage">%</option>
                                <option value="fixed_amount">Fissa (cent)</option>
                              </Select>
                              <Input
                                value={form.depositGreenValue}
                                onChange={(e) => updateForm({ depositGreenValue: e.target.value })}
                                inputMode="numeric"
                                className="w-24"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
`;
  content = content.replace(jsxOldFullRegex, replacementJSX);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Done rewriting BusinessOnboarding.tsx');