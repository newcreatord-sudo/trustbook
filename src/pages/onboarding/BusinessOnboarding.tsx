import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { errorMessage } from '@/lib/errors'
import { claimExternalBusinessListing, createBusinessWithDefaults } from '@/lib/businessSetup'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/authContext'
import OnboardingFooter from '@/pages/onboarding/OnboardingFooter'
import OnboardingHeader from '@/pages/onboarding/OnboardingHeader'
import DepositStep from '@/pages/onboarding/steps/DepositStep'
import IdentityStep from '@/pages/onboarding/steps/IdentityStep'
import LocationMediaStep from '@/pages/onboarding/steps/LocationMediaStep'
import ContactsStep from '@/pages/onboarding/steps/ContactsStep'
import ReviewStep from '@/pages/onboarding/steps/ReviewStep'
import RulesStep from '@/pages/onboarding/steps/RulesStep'
import ServicesStep from '@/pages/onboarding/steps/ServicesStep'
import ScheduleStep from '@/pages/onboarding/steps/ScheduleStep'
import StaffStep from '@/pages/onboarding/steps/StaffStep'
import { businessCategories, onboardingSteps } from '@/pages/onboarding/constants'
import { sanitizePublicHttpUrl } from '@/lib/publicImageUrl'
import { isEmailLike, isHttpUrl, isPhoneLike } from '@/utils/validators'
import Card from '@/shared/ui/Card'
import Alert from '@/shared/ui/Alert'

export type BusinessOnboardingForm = {
  name: string
  category: (typeof businessCategories)[number]
  description: string
  phone: string
  email: string
  website: string
  addressText: string
  city: string
  postalCode: string
  lat: string
  lng: string
  logoUrl: string
  galleryText: string
  isPaused: boolean
  approvalMode: 'auto' | 'manual' | 'risk_based'
  requiredReliabilityMin: string
  cancellationWindowMin: string
  minGapMin: string
  depositMode: 'none' | 'everyone' | 'risk_based' | 'dynamic'
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
  depositRetainedOnLateCancel: boolean
  services: Array<{ name: string; durationMin: string; priceCents: string }>
  schedule: Record<number, Array<{ start: string; end: string }>>
  staffEmails: string[]
}

export type BusinessOnboardingErrors = Partial<Record<keyof BusinessOnboardingForm, string>>

const DRAFT_KEY_PREFIX = 'trustbook:onboarding:business:v2'
const DRAFT_KIND = 'business'

function firstError(errors: BusinessOnboardingErrors): string | null {
  for (const k of Object.keys(errors) as Array<keyof BusinessOnboardingForm>) {
    const v = errors[k]
    if (v) return v
  }
  return null
}

function validateStep(idx: number, form: BusinessOnboardingForm): BusinessOnboardingErrors {
  const e: BusinessOnboardingErrors = {}

  const name = form.name.trim()
  const phone = form.phone.trim()
  const email = form.email.trim()
  const website = form.website.trim()
  const address = form.addressText.trim()
  const city = form.city.trim()
  const cap = form.postalCode.trim()
  const latNum = Number(form.lat)
  const lngNum = Number(form.lng)

  if (idx >= 0) {
    if (!name) e.name = 'Inserisci il nome attività.'
  }
  if (idx >= 1) {
    if (!phone && !email) e.phone = 'Inserisci almeno telefono o email.'
    if (phone && !isPhoneLike(phone)) e.phone = 'Telefono non valido.'
    if (email && !isEmailLike(email)) e.email = 'Email non valida.'
    if (website && !isHttpUrl(website)) e.website = 'Sito non valido (usa https://...).'
    if (!address) e.addressText = 'Indirizzo obbligatorio.'
    if (!city) e.city = 'Città obbligatoria.'
    if (cap && !/^\d{4,6}$/.test(cap.replace(/\s/g, ''))) e.postalCode = 'CAP non valido.'
  }
  if (idx >= 2) {
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      e.lat = 'Lat/Lng non validi.'
      e.lng = 'Lat/Lng non validi.'
    }
    if (Number.isFinite(latNum) && (latNum < -90 || latNum > 90)) {
      e.lat = 'Latitudine non valida (da -90 a 90).'
    }
    if (Number.isFinite(lngNum) && (lngNum < -180 || lngNum > 180)) {
      e.lng = 'Longitudine non valida (da -180 a 180).'
    }
    const logo = form.logoUrl.trim()
    if (logo && !isHttpUrl(logo)) e.logoUrl = 'Logo URL non valido.'
    const gallery = form.galleryText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const badGallery = gallery.find((u) => !isHttpUrl(u))
    if (badGallery) e.galleryText = 'Galleria: ogni riga deve essere un URL valido.'
  }
  if (idx >= 3) {
    if (form.services.length === 0) {
      e.services = 'Aggiungi almeno un servizio base.'
    } else {
      for (const s of form.services) {
        if (!s.name.trim()) {
          e.services = 'Tutti i servizi devono avere un nome.'
        }
        const d = Number(s.durationMin)
        if (!Number.isFinite(d) || d < 5) {
          e.services = 'Durata minima 5 minuti.'
        }
        if (s.priceCents) {
          const p = Number(s.priceCents)
          if (!Number.isFinite(p) || p < 0) {
            e.services = 'Prezzo non valido.'
          }
        }
      }
    }
  }
  if (idx >= 4) {
    const activeDays = Object.keys(form.schedule)
    if (activeDays.length === 0) {
      e.schedule = 'Seleziona almeno un giorno di apertura.'
    } else {
      for (const day of activeDays) {
        const ranges = form.schedule[Number(day)]
        const rangesSorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start))
        for (const r of ranges) {
          if (!r.start || !r.end || r.start >= r.end) {
            e.schedule = 'Orari non validi (fine deve essere dopo inizio).'
          }
        }
        for (let i = 1; i < rangesSorted.length; i += 1) {
          const prev = rangesSorted[i - 1]
          const curr = rangesSorted[i]
          if (prev.end > curr.start) {
            e.schedule = 'Le fasce orarie non possono sovrapporsi nello stesso giorno.'
          }
        }
      }
    }
  }
  if (idx >= 5) {
    const cancel = Number(form.cancellationWindowMin)
    const req = Number(form.requiredReliabilityMin)
    const gap = Number(form.minGapMin)
    if (!Number.isFinite(req) || req < 0 || req > 100) e.requiredReliabilityMin = 'Inserisci un valore 0–100.'
    if (form.approvalMode === 'risk_based' && req < 1) {
      e.requiredReliabilityMin = 'Con modalità rischio, imposta una soglia almeno 1.'
    }
    if (!Number.isFinite(cancel) || cancel < 0 || cancel > 10080 || !Number.isInteger(cancel)) {
      e.cancellationWindowMin = 'Inserisci minuti interi tra 0 e 10080.'
    }
    if (!Number.isFinite(gap) || gap < 0 || gap > 180 || !Number.isInteger(gap)) {
      e.minGapMin = 'Inserisci minuti interi tra 0 e 180.'
    }
  }
  if (idx >= 6) {
    if (form.depositMode === 'everyone' || form.depositMode === 'risk_based') {
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
    }
  }
  if (idx >= 7) {
    for (const email of form.staffEmails) {
      if (email.trim() && !isEmailLike(email.trim())) {
        e.staffEmails = 'Una o più email non sono valide.'
      }
    }
  }

  return e
}

function draftKeyForUser(userId: string | null): string {
  return userId ? `${DRAFT_KEY_PREFIX}:${userId}` : DRAFT_KEY_PREFIX
}

type DraftPayload = { idx: number; form: BusinessOnboardingForm; savedAt: number }

function safeParseDraft(raw: string | null): DraftPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<DraftPayload>
    if (!parsed.form) return null
    if (typeof parsed.idx !== 'number') return null
    if (typeof parsed.savedAt !== 'number') return null
    return { idx: parsed.idx, form: parsed.form as BusinessOnboardingForm, savedAt: parsed.savedAt }
  } catch {
    return null
  }
}

function firstInvalidStepIndex(form: BusinessOnboardingForm): { stepIdx: number; msg: string } | null {
  for (let i = 0; i < onboardingSteps.length - 1; i += 1) {
    const e = validateStep(i, form)
    const msg = firstError(e)
    if (msg) return { stepIdx: i, msg }
  }
  return null
}

export default function BusinessOnboarding() {
  const nav = useNavigate()
  const loc = useLocation()
  const { session, profile, loading: authLoading } = useAuth()
  const userId = session?.user?.id ?? null
  const mountedRef = useRef(true)

  const [idx, setIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const saveSeq = useRef(0)

  const prefillListingSlug = useMemo(() => {
    const raw = new URLSearchParams(loc.search).get('prefillListing')
    return raw ? raw.trim() : null
  }, [loc.search])
  const [prefillListingId, setPrefillListingId] = useState<string | null>(null)
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null)
  const prefillAppliedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!restoredAt) return
    const t = window.setTimeout(() => setRestoredAt(null), 2500)
    return () => window.clearTimeout(t)
  }, [restoredAt])

  const [form, setForm] = useState<BusinessOnboardingForm>({
    name: '',
    category: 'parrucchiere',
    description: '',
    phone: '',
    email: '',
    website: '',
    addressText: '',
    city: '',
    postalCode: '',
    lat: '41.9028',
    lng: '12.4964',
    logoUrl: '',
    galleryText: '',
    isPaused: false,
    approvalMode: 'risk_based',
    requiredReliabilityMin: '70',
    cancellationWindowMin: '120',
    minGapMin: '5',
    depositMode: 'risk_based',
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
    depositRetainedOnLateCancel: true,
    services: [{ name: 'Servizio base', durationMin: '45', priceCents: '' }],
    schedule: {
      1: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
      2: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
      3: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
      4: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
      5: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
    },
    staffEmails: [],
  })

  useEffect(() => {
    const key = draftKeyForUser(userId)
    const localDraft = safeParseDraft(localStorage.getItem(key))

    let mounted = true
    setDraftHydrated(false)
    ;(async () => {
      try {
        let remoteDraft: DraftPayload | null = null
        if (userId) {
          const { data } = await supabase
            .from('onboarding_drafts')
            .select('payload,updated_at')
            .eq('user_id', userId)
            .eq('kind', DRAFT_KIND)
            .maybeSingle()
          const payload = (data as { payload?: unknown } | null)?.payload
          if (payload && typeof payload === 'object') {
            const p = payload as Partial<DraftPayload>
            if (p.form && typeof p.idx === 'number' && typeof p.savedAt === 'number') {
              remoteDraft = { idx: p.idx, form: p.form as BusinessOnboardingForm, savedAt: p.savedAt }
            }
          }
        }

        const chosen =
          !localDraft ? remoteDraft : !remoteDraft ? localDraft : localDraft.savedAt >= remoteDraft.savedAt ? localDraft : remoteDraft

        if (!mounted) return
        if (!chosen) return

        setForm(chosen.form)
        setIdx(Math.max(0, Math.min(onboardingSteps.length - 1, chosen.idx)))
        setSavedAt(chosen.savedAt)
        setRestoredAt(Date.now())
      } finally {
        if (mounted) setDraftHydrated(true)
      }
    })()

    return () => {
      mounted = false
    }
  }, [userId])

  useEffect(() => {
    if (!draftHydrated) return
    if (!prefillListingSlug) return
    if (prefillAppliedRef.current) return

    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('external_business_listings_public')
          .select('id,slug,name,category,address_text,city,postal_code,lat,lng,listing_status')
          .eq('slug', prefillListingSlug)
          .maybeSingle()
        if (error) throw error
        if (!data || typeof data !== 'object') throw new Error('Scheda non trovata.')
        const rec = data as Record<string, unknown>

        const listingId = typeof rec.id === 'string' ? rec.id : null
        const name = typeof rec.name === 'string' ? rec.name.trim() : ''
        const categoryRaw = typeof rec.category === 'string' ? rec.category.trim().toLowerCase() : ''
        const categoryNormalized = (businessCategories as readonly string[]).includes(categoryRaw) ? categoryRaw : 'altro'
        const addressText = typeof rec.address_text === 'string' ? rec.address_text.trim() : ''
        const city = typeof rec.city === 'string' ? rec.city.trim() : ''
        const postalCode = typeof rec.postal_code === 'string' ? rec.postal_code.trim() : ''
        const lat = typeof rec.lat === 'number' && Number.isFinite(rec.lat) ? rec.lat : null
        const lng = typeof rec.lng === 'number' && Number.isFinite(rec.lng) ? rec.lng : null

        if (!listingId) throw new Error('Scheda non valida.')
        if (!mounted) return

        setPrefillListingId(listingId)
        setForm((prev) => {
          const next: BusinessOnboardingForm = { ...prev }
          const defaultLat = prev.lat.trim() === '41.9028' && prev.lng.trim() === '12.4964'

          if (name) next.name = name
          if (categoryNormalized !== 'altro') next.category = categoryNormalized as BusinessOnboardingForm['category']
          if (addressText) next.addressText = addressText
          if (city) next.city = city
          if (postalCode) next.postalCode = postalCode
          if ((defaultLat || prev.lat.trim() === '' || prev.lng.trim() === '') && lat !== null && lng !== null) {
            next.lat = String(lat)
            next.lng = String(lng)
          }
          next.phone = ''
          next.email = ''
          next.website = ''
          next.description = ''
          next.isPaused = true
          return next
        })
        setPrefillNotice(
          'Scheda importata: nome e indirizzo sono precompilati. Per sicurezza, contatti e descrizione non vengono importati: inseriscili tu e pubblica quando sei pronto.',
        )
        setRestoredAt(Date.now())
        prefillAppliedRef.current = true
      } catch (e: unknown) {
        if (!mounted) return
        setPrefillNotice(errorMessage(e, 'Errore caricamento scheda importata.'))
      }
    })()

    return () => {
      mounted = false
    }
  }, [draftHydrated, prefillListingSlug])

  const persistDraft = useCallback(async (mode: 'auto' | 'manual') => {
    if (!mountedRef.current) return
    const seq = ++saveSeq.current
    const now = Date.now()
    const payload: DraftPayload = { idx, form, savedAt: now }
    setDraftError(null)
    setDraftState('saving')

    try {
      localStorage.setItem(draftKeyForUser(userId), JSON.stringify(payload))
      if (mountedRef.current) setSavedAt(now)
    } catch {
      if (mountedRef.current && seq === saveSeq.current) {
        setDraftState('error')
        setDraftError('Storage non disponibile')
      }
      return
    }

    if (!userId) {
      if (mountedRef.current && seq === saveSeq.current) setDraftState('saved')
      return
    }

    const { error: upsertError } = await supabase
      .from('onboarding_drafts')
      .upsert({ user_id: userId, kind: DRAFT_KIND, payload, updated_at: new Date(now).toISOString() })

    if (!mountedRef.current || seq !== saveSeq.current) return
    if (upsertError) {
      setDraftState('error')
      setDraftError(mode === 'manual' ? upsertError.message : 'Connessione instabile')
      return
    }
    setDraftState('saved')
  }, [form, idx, userId])

  useEffect(() => {
    if (!draftHydrated) return
    const t = window.setTimeout(() => {
      if (!mountedRef.current) return
      void persistDraft('auto')
    }, 900)
    return () => window.clearTimeout(t)
  }, [draftHydrated, form, idx, persistDraft, userId])

  const saveDraftNow = () => {
    void persistDraft('manual')
  }

  const galleryUrls = useMemo(() => {
    return form.galleryText
      .split('\n')
      .map((s) => sanitizePublicHttpUrl(s.trim()))
      .filter((u): u is string => Boolean(u))
  }, [form.galleryText])

  const currentErrors = useMemo(() => validateStep(idx, form), [form, idx])

  const completed = useMemo(() => {
    const steps = onboardingSteps.map((_, i) =>
      Object.keys(validateStep(Math.min(i, onboardingSteps.length - 2), form)).length === 0,
    )
    const firstIncomplete = steps.findIndex((x, i) => i < onboardingSteps.length - 1 && !x)
    const maxEnabled = firstIncomplete === -1 ? onboardingSteps.length - 1 : Math.min(onboardingSteps.length - 1, firstIncomplete + 1)
    return { steps, maxEnabled }
  }, [form])

  const canNext = Object.keys(currentErrors).length === 0

  const step = onboardingSteps[idx]

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <OnboardingHeader
          idx={idx}
          maxEnabledIdx={completed.maxEnabled}
          completed={completed.steps}
          savedAt={savedAt}
          canSaveDraft={Boolean(userId)}
          draftState={draftState}
          draftError={draftError}
          onSaveDraft={() => {
            setError(null)
            saveDraftNow()
          }}
          onReset={() => {
            ;(async () => {
              try {
                localStorage.removeItem(draftKeyForUser(userId))
              } catch {
                // ignore local storage cleanup errors
              }
              if (userId) {
                await supabase.from('onboarding_drafts').delete().eq('user_id', userId).eq('kind', DRAFT_KIND)
              }
              setError(null)
              setShowErrors(false)
              setSavedAt(null)
              setIdx(0)
              setPrefillListingId(null)
              setPrefillNotice(null)
              prefillAppliedRef.current = false
              setForm({
                name: '',
                category: 'parrucchiere',
                description: '',
                phone: '',
                email: '',
                website: '',
                addressText: '',
                city: '',
                postalCode: '',
                lat: '41.9028',
                lng: '12.4964',
                logoUrl: '',
                galleryText: '',
                isPaused: false,
                approvalMode: 'risk_based',
                requiredReliabilityMin: '70',
                cancellationWindowMin: '120',
                minGapMin: '5',
                depositMode: 'risk_based',
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
                depositRetainedOnLateCancel: true,
                services: [{ name: 'Servizio base', durationMin: '45', priceCents: '' }],
                schedule: {
                  1: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
                  2: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
                  3: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
                  4: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
                  5: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
                },
                staffEmails: [],
              })
            })()
          }}
          onJump={(next) => {
            setError(null)
            if (saving) return
            if (next === idx) return
            if (next > completed.maxEnabled) {
              setError('Completa prima lo step precedente.')
              setShowErrors(true)
              return
            }
            if (next > idx) {
              const e = validateStep(idx, form)
              const msg = firstError(e)
              if (msg) {
                setError(msg)
                setShowErrors(true)
                return
              }
            }
            setShowErrors(false)
            setIdx(next)
          }}
        />

        {restoredAt && <Alert tone="info">Bozza ripristinata automaticamente.</Alert>}
        {prefillNotice ? <Alert tone="info">{prefillNotice}</Alert> : null}

        <Card padded={false} className="overflow-hidden border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent shadow-2xl">
          <div className="border-b border-white/5 bg-white/[0.02] px-6 py-5 md:px-8">
            <div className="text-xl font-bold tracking-tight text-white">{step.title}</div>
            <div className="mt-1 text-sm font-medium text-white/60">{step.subtitle}</div>
          </div>

          <div className="p-6 md:p-8">
            {error && (
              <div className="mb-6">
                <Alert tone="danger">{error}</Alert>
              </div>
            )}

            <div className="min-h-[300px]">
              {idx === 0 && <IdentityStep value={form} onChange={setForm} errors={showErrors ? currentErrors : undefined} />}
              {idx === 1 && <ContactsStep value={form} onChange={setForm} errors={showErrors ? currentErrors : undefined} />}
              {idx === 2 && (
                <LocationMediaStep value={form} onChange={setForm} onError={setError} errors={showErrors ? currentErrors : undefined} />
              )}
              {idx === 3 && <ServicesStep value={form} onChange={setForm} errors={showErrors ? currentErrors : undefined} />}
              {idx === 4 && <ScheduleStep value={form} onChange={setForm} errors={showErrors ? currentErrors : undefined} />}
              {idx === 5 && <RulesStep value={form} onChange={setForm} errors={showErrors ? currentErrors : undefined} />}
              {idx === 6 && <DepositStep value={form} onChange={setForm} errors={showErrors ? currentErrors : undefined} />}
              {idx === 7 && <StaffStep value={form} onChange={setForm} errors={showErrors ? currentErrors : undefined} />}
              {idx === 8 && (
                <ReviewStep
                  value={form}
                  onCreate={async () => {
                    setError(null)
                    setSaving(true)
                    try {
                      if (authLoading) throw new Error('Caricamento profilo in corso, riprova tra un attimo.')
                      if (!userId) throw new Error('Non autenticato.')
                      if (!profile) throw new Error('Profilo non disponibile.')
                      if (profile.role !== 'attivita') throw new Error('Ruolo non valido.')
                      const invalid = firstInvalidStepIndex(form)
                      if (invalid) {
                        setIdx(invalid.stepIdx)
                        setShowErrors(true)
                        throw new Error(invalid.msg)
                      }
                      const latNum = Number(form.lat)
                      const lngNum = Number(form.lng)
                      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) throw new Error('Lat/Lng non validi.')
                      if (latNum < -90 || latNum > 90) throw new Error('Latitudine non valida (da -90 a 90).')
                      if (lngNum < -180 || lngNum > 180) throw new Error('Longitudine non valida (da -180 a 180).')

                      const valFixed = Math.max(0, Math.floor(Number(form.depositFixedCents) || 0))
                      const valPercent = Math.max(0, Math.min(100, Math.floor(Number(form.depositPercent) || 0)))
                      const valMin = Math.max(0, Math.floor(Number(form.depositMin) || 0))
                      const valMax = Math.max(0, Math.floor(Number(form.depositMax) || 0))
                      
                      const gVal = Math.max(0, form.depositGreenType === 'percentage' ? Math.min(100, Math.floor(Number(form.depositGreenValue)||0)) : Math.floor(Number(form.depositGreenValue)||0))
                      const yVal = Math.max(0, form.depositYellowType === 'percentage' ? Math.min(100, Math.floor(Number(form.depositYellowValue)||0)) : Math.floor(Number(form.depositYellowValue)||0))
                      const rVal = Math.max(0, form.depositRedType === 'percentage' ? Math.min(100, Math.floor(Number(form.depositRedValue)||0)) : Math.floor(Number(form.depositRedValue)||0))
                      const cfh = Math.max(0, Math.floor(Number(form.cancellationFreeUntilHours) || 24))
                      
                      if (form.depositMode === 'everyone' || form.depositMode === 'risk_based') {
                        if (form.depositValueType === 'fixed_amount' && valFixed === 0) {
                          throw new Error('Imposta una caparra fissa > 0 oppure scegli percentuale.')
                        }
                        if (form.depositValueType === 'percentage' && valPercent === 0) {
                          throw new Error('Imposta una percentuale > 0 oppure scegli fissa.')
                        }
                      }

                      const input = {
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
                        logoUrl: sanitizePublicHttpUrl(form.logoUrl.trim()) ?? null,
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
                        depositRetainedOnLateCancel: form.depositRetainedOnLateCancel,
                        services: form.services.map((s) => ({
                          name: s.name.trim(),
                          durationMin: Math.max(5, Math.floor(Number(s.durationMin) || 45)),
                          priceCents: s.priceCents ? Math.max(0, Math.floor(Number(s.priceCents) * 100)) : null,
                        })),
                        schedule: form.schedule,
                        staffEmails: form.staffEmails.map((e) => e.trim()).filter((e) => e && isEmailLike(e)),
                      }

                      if (prefillListingId) {
                        await claimExternalBusinessListing({ listingId: prefillListingId, input })
                      } else {
                        await createBusinessWithDefaults({ ownerUserId: userId, input })
                      }
                      try {
                        localStorage.removeItem(draftKeyForUser(userId))
                      } catch {
                        // ignore local storage cleanup errors
                      }
                      await supabase.from('onboarding_drafts').delete().eq('user_id', userId).eq('kind', DRAFT_KIND)
                      nav('/dashboard-attivita', { replace: true })
                    } catch (e: unknown) {
                      setError(errorMessage(e, 'Errore creazione attività.'))
                    } finally {
                      setSaving(false)
                    }
                  }}
                  saving={saving}
                  canCreate={Boolean(userId && !authLoading && profile?.role === 'attivita')}
                  disabledReason={
                    authLoading
                      ? 'Caricamento profilo…'
                      : !userId
                        ? 'Accedi per creare l’attività.'
                        : profile?.role !== 'attivita'
                          ? 'Questo account non può creare attività.'
                          : null
                  }
                />
              )}
            </div>

            <div className="mt-8 border-t border-white/5 pt-6">
              <OnboardingFooter
                idx={idx}
                saving={saving}
                canNext={canNext}
                onBack={() => setIdx((v) => Math.max(0, v - 1))}
                onNext={() => {
                  setError(null)
                  if (!canNext) {
                    const msg = firstError(currentErrors)
                    if (msg) setError(msg)
                    setShowErrors(true)
                    return
                  }
                  setShowErrors(false)
                  setIdx((v) => Math.min(onboardingSteps.length - 1, v + 1))
                }}
              />
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
