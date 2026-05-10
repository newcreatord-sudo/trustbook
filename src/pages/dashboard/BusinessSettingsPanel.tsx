import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { BusinessRow } from '@/domain/supabase'
import type { BusinessFeatureGate } from '@/lib/subscriptions'
import BusinessEcosystemSection from '@/components/BusinessEcosystemSection'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { sanitizePublicHttpUrl } from '@/lib/publicImageUrl'
import {
  DEFAULT_PUBLIC_PROFILE_SETTINGS,
  PUBLIC_PROFILE_SECTIONS,
  resolvePublicProfileSettings,
  type BusinessPublicProfileSettings,
} from '@/lib/publicProfileSettings'
import { uploadBusinessMedia } from '@/lib/storage'
import { isValidBusinessSlug, toBusinessSlug } from '@/lib/slug'
import { getFloorPlanBundle } from '@/lib/floorPlanApi'
import { businessPublicPath } from '@/lib/businessPublicPath'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'
import MediaThumb from '@/shared/ui/MediaThumb'
import Modal from '@/shared/ui/Modal'

const categories = [
  'barbiere',
  'parrucchiere',
  'estetista',
  'tatuatore',
  'massaggiatore',
  'studio_medico',
  'personal_trainer',
  'ristorante',
  'pizzeria',
  'hotel_bnb',
  'officina',
  'consulente',
  'professionista',
  'centro_sportivo',
  'altro',
] as const

export default function BusinessSettingsPanel(props: {
  business: BusinessRow
  onUpdated: (next: BusinessRow) => void
  featureGate: BusinessFeatureGate
}) {
  const b = props.business
  const nav = useNavigate()
  const loc = useLocation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [name, setName] = useState(b.name)
  const [slug, setSlug] = useState(b.slug ?? '')
  const [category, setCategory] = useState(b.category)
  const [description, setDescription] = useState(b.description ?? '')
  const [addressText, setAddressText] = useState(b.address_text ?? '')
  const [postalCode, setPostalCode] = useState(b.postal_code ?? '')
  const [city, setCity] = useState(b.city ?? '')
  const [timezone, setTimezone] = useState(b.timezone ?? 'Europe/Rome')
  const [phone, setPhone] = useState(b.phone ?? '')
  const [email, setEmail] = useState(b.email ?? '')
  const [website, setWebsite] = useState(b.website ?? '')
  const [logoUrl, setLogoUrl] = useState(b.logo_url ?? '')
  const [galleryText, setGalleryText] = useState((b.gallery_urls ?? []).join('\n'))
  const [isPaused, setIsPaused] = useState(Boolean(b.is_paused))
  const [listingVisible, setListingVisible] = useState(b.listing_visible ?? true)
  const [publicProfile, setPublicProfile] = useState<BusinessPublicProfileSettings>(() =>
    resolvePublicProfileSettings(b.public_profile_settings),
  )
  const [lat, setLat] = useState(String(b.lat))
  const [lng, setLng] = useState(String(b.lng))

  const [minGapMin, setMinGapMin] = useState(String(b.min_gap_min ?? 0))

  const [approvalMode, setApprovalMode] = useState<BusinessRow['approval_mode']>(b.approval_mode)
  const [requiredReliabilityMin, setRequiredReliabilityMin] = useState(String(b.required_reliability_min))
  const [cancellationWindowMin, setCancellationWindowMin] = useState(String(b.cancellation_window_min))
  const [bookingLeadTimeMin, setBookingLeadTimeMin] = useState(String(b.booking_lead_time_min ?? 0))

  const [depositMode, setDepositMode] = useState<BusinessRow['deposit_mode']>(b.deposit_mode ?? 'none')
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
  const [depositRetainedOnLateCancel, setDepositRetainedOnLateCancel] = useState(b.deposit_retained_on_late_cancel ?? true)

  const [blockReliabilityThreshold, setBlockReliabilityThreshold] = useState(String(b.block_reliability_threshold ?? 15))
  const [autoBlockNoShowCount, setAutoBlockNoShowCount] = useState(String(b.auto_block_no_show_count ?? 3))

  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  const [completenessLoading, setCompletenessLoading] = useState(false)
  const [servicesCount, setServicesCount] = useState<number | null>(null)
  const [openingWindowsCount, setOpeningWindowsCount] = useState<number | null>(null)
  const [floorPlanCount, setFloorPlanCount] = useState<number | null>(null)
  const [resourceCount, setResourceCount] = useState<number | null>(null)

  useEffect(() => {
    setName(b.name)
    setSlug(b.slug ?? '')
    setCategory(b.category)
    setDescription(b.description ?? '')
    setAddressText(b.address_text ?? '')
    setPostalCode(b.postal_code ?? '')
    setCity(b.city ?? '')
    setTimezone(b.timezone ?? 'Europe/Rome')
    setPhone(b.phone ?? '')
    setEmail(b.email ?? '')
    setWebsite(b.website ?? '')
    setLogoUrl(b.logo_url ?? '')
    setGalleryText((b.gallery_urls ?? []).join('\n'))
    setIsPaused(Boolean(b.is_paused))
    setListingVisible(b.listing_visible ?? true)
    setPublicProfile(resolvePublicProfileSettings(b.public_profile_settings))
    setLat(String(b.lat))
    setLng(String(b.lng))

    setMinGapMin(String(b.min_gap_min ?? 0))

    setApprovalMode(b.approval_mode)
    setRequiredReliabilityMin(String(b.required_reliability_min))
    setCancellationWindowMin(String(b.cancellation_window_min))
    setBookingLeadTimeMin(String(b.booking_lead_time_min ?? 0))

    setDepositMode(b.deposit_mode ?? 'none')
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
    setDepositRetainedOnLateCancel(b.deposit_retained_on_late_cancel ?? true)

    setBlockReliabilityThreshold(String(b.block_reliability_threshold ?? 15))
    setAutoBlockNoShowCount(String(b.auto_block_no_show_count ?? 3))
  }, [b])

  useEffect(() => {
    let mounted = true
    setCompletenessLoading(true)
    ;(async () => {
      try {
        const [svcRes, owRes, floorPlans] = await Promise.all([
          supabase.from('services').select('id').eq('business_id', b.id).eq('is_active', true).limit(200),
          supabase.from('business_opening_windows').select('id').eq('business_id', b.id).limit(200),
          getFloorPlanBundle(b.id).catch(() => []),
        ])
        if (!mounted) return
        if (svcRes.error) throw svcRes.error
        if (owRes.error) throw owRes.error
        const svcCount = (svcRes.data ?? []).length
        const owCount = (owRes.data ?? []).length
        setServicesCount(svcCount)
        setOpeningWindowsCount(owCount)
        setFloorPlanCount(floorPlans.length)
        let resources = 0
        for (const fp of floorPlans) resources += fp.resource_count ?? 0
        setResourceCount(resources)
      } catch {
        if (!mounted) return
        setServicesCount(null)
        setOpeningWindowsCount(null)
        setFloorPlanCount(null)
        setResourceCount(null)
      } finally {
        if (mounted) setCompletenessLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [b.id])

  useEffect(() => {
    const params = new URLSearchParams(loc.search)
    const section = params.get('section')
    if (section !== 'ecosistema') return
    const targetId = 'ecosistema-prenotazioni'
    let tries = 0
    const tick = () => {
      tries += 1
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      if (tries < 20) window.setTimeout(tick, 80)
    }
    tick()
  }, [loc.search])

  const profileCompletion = useMemo(() => {
    const items = [
      { key: 'name', label: 'Nome', ok: Boolean(name.trim()) },
      { key: 'slug', label: 'URL pubblico', ok: Boolean((b.slug ?? slug).trim()) },
      { key: 'logo', label: 'Logo', ok: Boolean((b.logo_url ?? logoUrl).trim()) },
      { key: 'gallery', label: 'Foto (min 3)', ok: (b.gallery_urls ?? []).length >= 3 || galleryText.split('\n').map((s) => s.trim()).filter(Boolean).length >= 3 },
      { key: 'desc', label: 'Descrizione', ok: (description.trim().length >= 80) },
      { key: 'address', label: 'Indirizzo', ok: Boolean(addressText.trim() && city.trim()) },
      { key: 'geo', label: 'Coordinate', ok: Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) },
      { key: 'services', label: 'Servizi attivi', ok: (servicesCount ?? 0) > 0 },
      { key: 'hours', label: 'Orari', ok: (openingWindowsCount ?? 0) > 0 },
      { key: 'floorPlan', label: 'Planimetria/risorse', ok: (floorPlanCount ?? 0) > 0 && (resourceCount ?? 0) > 0 },
    ]
    const done = items.filter((x) => x.ok).length
    const total = items.length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { items, done, total, pct }
  }, [
    addressText,
    b.gallery_urls,
    b.logo_url,
    b.slug,
    city,
    description,
    floorPlanCount,
    galleryText,
    lat,
    lng,
    logoUrl,
    name,
    openingWindowsCount,
    resourceCount,
    servicesCount,
    slug,
  ])

  const effectiveSlug = useMemo(() => {
    const raw = slug.trim() ? toBusinessSlug(slug.trim()) : (b.slug ?? '').trim()
    return raw || null
  }, [b.slug, slug])

  const publicUrl = useMemo(() => {
    const path = businessPublicPath({ id: b.id, slug: effectiveSlug })
    return `${window.location.origin}${path}`
  }, [b.id, effectiveSlug])

  const floorPlanInitialTab = useMemo(() => {
    const params = new URLSearchParams(loc.search)
    const v = params.get('fpTab')
    if (v !== 'plans' && v !== 'editor' && v !== 'resources') return null
    return v
  }, [loc.search])

  const isDirty = useMemo(() => {
    return (
      name !== b.name ||
      category !== b.category ||
      description !== (b.description ?? '') ||
      addressText !== (b.address_text ?? '') ||
      postalCode !== (b.postal_code ?? '') ||
      city !== (b.city ?? '') ||
      timezone !== (b.timezone ?? 'Europe/Rome') ||
      phone !== (b.phone ?? '') ||
      email !== (b.email ?? '') ||
      website !== (b.website ?? '') ||
      logoUrl !== (b.logo_url ?? '') ||
      galleryText !== (b.gallery_urls ?? []).join('\n') ||
      isPaused !== Boolean(b.is_paused) ||
      lat !== String(b.lat) ||
      lng !== String(b.lng) ||
      minGapMin !== String(b.min_gap_min ?? 0) ||
      approvalMode !== b.approval_mode ||
      requiredReliabilityMin !== String(b.required_reliability_min) ||
      cancellationWindowMin !== String(b.cancellation_window_min) ||
      bookingLeadTimeMin !== String(b.booking_lead_time_min ?? 0) ||
      depositMode !== (b.deposit_mode ?? 'none') ||
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
      depositRetainedOnLateCancel !== (b.deposit_retained_on_late_cancel ?? true) ||
      blockReliabilityThreshold !== String(b.block_reliability_threshold ?? 15) ||
      autoBlockNoShowCount !== String(b.auto_block_no_show_count ?? 3) ||
      listingVisible !== (b.listing_visible ?? true) ||
      (slug.trim() ? toBusinessSlug(slug.trim()) : '') !== (b.slug ?? '').trim() ||
      JSON.stringify(publicProfile) !== JSON.stringify(resolvePublicProfileSettings(b.public_profile_settings))
    )
  }, [
    addressText,
    approvalMode,
    b,
    cancellationWindowMin,
    bookingLeadTimeMin,
    category,
    city,
    timezone,
    depositMode,
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
    depositRetainedOnLateCancel,
    blockReliabilityThreshold,
    autoBlockNoShowCount,
    description,
    email,
    lat,
    lng,
    minGapMin,
    name,
    phone,
    postalCode,
    requiredReliabilityMin,
    logoUrl,
    galleryText,
    isPaused,
    listingVisible,
    slug,
    publicProfile,
    website,
  ])

  return (
    <>
    <Card padded={false} className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="tb-title">Impostazioni attività</div>
          <div className="tb-subtitle mt-1">Dati pubblici + regole anti no-show.</div>
        </div>
        <Button
          type="button"
          disabled={!isDirty || saving}
          onClick={() => {
            setError(null)
            setSuccess(null)
            const latNum = Number(lat)
            const lngNum = Number(lng)
            if (!name.trim()) return setError('Nome attività obbligatorio.')
            if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return setError('Lat/Lng non validi.')

            const cancelMin = Math.max(0, Math.floor(Number(cancellationWindowMin) || 0))
            const leadMin = Math.max(0, Math.floor(Number(bookingLeadTimeMin) || 0))
            const reqMin = Math.max(0, Math.min(100, Math.floor(Number(requiredReliabilityMin) || 0)))
            const gapMin = Math.max(0, Math.floor(Number(minGapMin) || 0))
            const valFixed = Math.max(0, Math.floor(Number(depositFixedCents) || 0))
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
            }

            const sanitizedLogo = sanitizePublicHttpUrl(logoUrl.trim())
            if (logoUrl.trim() && !sanitizedLogo) {
              return setError('URL logo non valido (solo http/https).')
            }

            const galleryLines = galleryText.split('\n').map((s) => s.trim()).filter(Boolean)
            const galleryUrlsSanitized: string[] = []
            for (const line of galleryLines) {
              const u = sanitizePublicHttpUrl(line)
              if (!u) {
                return setError(`URL galleria non valido (solo http/https): ${line}`)
              }
              galleryUrlsSanitized.push(u)
            }

            const slugNormalized = slug.trim() ? toBusinessSlug(slug.trim()) : null
            if (slugNormalized && !isValidBusinessSlug(slugNormalized)) {
              return setError('URL pubblico non valido. Usa solo lettere minuscole, numeri e trattini (es: nome-attivita).')
            }

            setSaving(true)
            ;(async () => {
              try {
                const payload: Record<string, unknown> = {
                  name: name.trim(),
                  slug: slugNormalized,
                  category,
                  public_profile_settings: publicProfile,
                  description: description.trim() || null,
                  address_text: addressText.trim() || null,
                  postal_code: postalCode.trim() || null,
                  city: city.trim() || null,
                  timezone: timezone.trim() || 'Europe/Rome',
                  phone: phone.trim() || null,
                  email: email.trim() || null,
                  website: website.trim() || null,
                  logo_url: sanitizedLogo ?? null,
                  gallery_urls: galleryUrlsSanitized,
                  is_paused: isPaused,
                  listing_visible: listingVisible,
                  lat: latNum,
                  lng: lngNum,
                  min_gap_min: gapMin,
                  approval_mode: approvalMode,
                  required_reliability_min: reqMin,
                  cancellation_window_min: cancelMin,
                  booking_lead_time_min: leadMin,
                  deposit_mode: depositMode,
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
                  deposit_retained_on_late_cancel: depositRetainedOnLateCancel,
                }

                let res = await supabase
                  .from('businesses')
                  .update(payload)
                  .eq('id', b.id)
                  .select('*')
                  .single()
                if (res.error && slugNormalized) {
                  const code = String((res.error as unknown as { code?: unknown }).code ?? '')
                  const msg = String((res.error as unknown as { message?: unknown }).message ?? '')
                  if (code === '42703' || msg.toLowerCase().includes('slug')) {
                    const retryPayload = { ...payload } as Record<string, unknown>
                    delete retryPayload.slug
                    res = await supabase.from('businesses').update(retryPayload).eq('id', b.id).select('*').single()
                    if (res.error) throw res.error
                    props.onUpdated(res.data as BusinessRow)
                    setSuccess('Impostazioni salvate. Per URL pubblico applica la migrazione DB (slug).')
                    return
                  }
                }
                if (res.error) throw res.error
                props.onUpdated(res.data as BusinessRow)
                setSuccess('Impostazioni salvate.')
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

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {success && (
        <Alert tone="success" className="mt-4">
          {success}
        </Alert>
      )}

      <div className="mt-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="tb-label">COMPLETAMENTO PROFILO</div>
              <div className="mt-1 text-sm text-white/70">
                {completenessLoading ? 'Calcolo…' : `${profileCompletion.pct}% · ${profileCompletion.done}/${profileCompletion.total} completati`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-white/60">{listingVisible ? 'Pubblico' : 'Nascosto'}</div>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setWizardOpen(true)}>
                  Guida
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!listingVisible}
                  onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                >
                  Apri profilo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void (async () => {
                      try {
                        await navigator.clipboard.writeText(publicUrl)
                        setSuccess('Link copiato.')
                      } catch {
                        setError('Impossibile copiare il link su questo browser.')
                      }
                    })()
                  }}
                >
                  Copia link
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#4F7CFF]/70" style={{ width: `${profileCompletion.pct}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {profileCompletion.items.map((it) => (
              <div
                key={it.key}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs font-semibold',
                  it.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/5 text-white/70',
                )}
              >
                {it.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="tb-label">PAUSA</div>
                <div className="mt-1 text-sm text-white/70">
                  Se attiva, i clienti vedono l’attività ma non possono prenotare.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaused((v) => !v)}
                className={cn(
                  'rounded-2xl px-4 py-2 text-xs font-semibold transition',
                  isPaused ? 'bg-amber-500/15 text-amber-50 hover:bg-amber-500/20' : 'bg-white/10 text-white/80 hover:bg-white/15',
                )}
              >
                {isPaused ? 'In pausa' : 'Attiva'}
              </button>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="tb-label">VISIBILITÀ</div>
                <div className="mt-1 text-sm text-white/70">
                  Se disattiva, l’attività non appare in Esplora e non è accessibile pubblicamente.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setListingVisible((v) => !v)}
                className={cn(
                  'rounded-2xl px-4 py-2 text-xs font-semibold transition',
                  listingVisible
                    ? 'bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/20'
                    : 'bg-white/10 text-white/80 hover:bg-white/15',
                )}
              >
                {listingVisible ? 'Pubblicata' : 'Non pubblicata'}
              </button>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="tb-label">Profilo pubblico — cosa mostrare</div>
            <p className="mt-1 text-sm text-white/65">
              Controlli granulari sulla pagina pubblica dell’attività (foto, descrizione, planimetria, contatti, recensioni). La planimetria richiede anche
              l’opzione corrispondente in <span className="text-white/80">Ecosistema prenotazioni</span>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                onClick={() => setPublicProfile({ ...DEFAULT_PUBLIC_PROFILE_SETTINGS })}
              >
                Mostra tutte le sezioni (consigliato)
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PUBLIC_PROFILE_SECTIONS.map((row) => (
                <label key={row.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 transition-colors hover:border-white/18">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/25 bg-white/5 text-[#4F7CFF] focus:ring-[#4F7CFF]/40"
                    checked={publicProfile[row.key]}
                    onChange={() =>
                      setPublicProfile((p) => ({
                        ...p,
                        [row.key]: !p[row.key],
                      }))
                    }
                  />
                  <span>
                    <span className="text-sm font-semibold text-white">{row.label}</span>
                    <span className="mt-0.5 block text-xs text-white/55">{row.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div id="business-name">
          <label className="tb-label">Nome attività</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
          />
        </div>

        <div id="business-public-url" className="md:col-span-2">
          <label className="tb-label">URL pubblico</label>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onBlur={() => {
              if (!slug.trim()) return
              setSlug(toBusinessSlug(slug.trim()))
            }}
            className="mt-1"
            placeholder="es: barbiere-roma-centro"
          />
          <div className="mt-1 text-xs text-white/55">
            Link:{' '}
            <span className="font-semibold text-white/70">{`${window.location.origin}/b/${encodeURIComponent(
              (slug.trim() ? toBusinessSlug(slug.trim()) : b.slug ?? '').trim() || '...',
            )}`}</span>
          </div>
        </div>

        <div>
          <label className="tb-label">Categoria</label>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        <div id="business-logo">
          <label className="tb-label">Logo (URL)</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="secondary"
              disabled={uploadingLogo || saving}
              onClick={() => logoInputRef.current?.click()}
              leftIcon={<ImagePlus className="h-4 w-4" />}
            >
              {uploadingLogo ? 'Caricamento…' : 'Carica logo'}
            </Button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                if (!file) return
                e.currentTarget.value = ''
                setError(null)
                setSuccess(null)
                setUploadingLogo(true)
                ;(async () => {
                  try {
                    const uploaded = await uploadBusinessMedia({ businessId: b.id, file, kind: 'logo' })
                    const { data, error } = await supabase
                      .from('businesses')
                      .update({ logo_url: uploaded.publicUrl })
                      .eq('id', b.id)
                      .select('*')
                      .single()
                    if (error) throw error
                    props.onUpdated(data as BusinessRow)
                    setSuccess('Logo aggiornato.')
                  } catch (err: unknown) {
                    setError(errorMessage(err, 'Errore upload logo.'))
                  } finally {
                    setUploadingLogo(false)
                  }
                })()
              }}
            />
          </div>
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
            className="mt-2"
          />
          {logoUrl.trim() && (
            <div className="mt-2 rounded-2xl border border-white/12 bg-white/[0.04] p-3 backdrop-blur-sm ring-1 ring-white/[0.06]">
              <MediaThumb
                src={logoUrl.trim()}
                alt={`Anteprima logo ${b.name}`}
                fallbackLabel={b.name}
                zoom
                containerClassName="inline-block h-16 w-16 align-middle text-xl"
              />
            </div>
          )}
        </div>

        <div id="business-gallery" className="md:col-span-2">
          <label className="tb-label">Galleria (1 URL per riga)</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="secondary"
              disabled={uploadingGallery || saving}
              onClick={() => galleryInputRef.current?.click()}
              leftIcon={<ImagePlus className="h-4 w-4" />}
            >
              {uploadingGallery ? 'Caricamento…' : 'Aggiungi foto'}
            </Button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                if (files.length === 0) return
                e.currentTarget.value = ''
                setError(null)
                setSuccess(null)
                setUploadingGallery(true)
                ;(async () => {
                  try {
                    const uploadedUrls: string[] = []
                    for (const file of files.slice(0, 8)) {
                      const up = await uploadBusinessMedia({ businessId: b.id, file, kind: 'gallery' })
                      uploadedUrls.push(up.publicUrl)
                    }

                    const prev = galleryText
                      .split('\n')
                      .map((x) => x.trim())
                      .filter(Boolean)
                    const next = [...prev, ...uploadedUrls]
                    const { data, error } = await supabase
                      .from('businesses')
                      .update({ gallery_urls: next })
                      .eq('id', b.id)
                      .select('*')
                      .single()
                    if (error) throw error
                    props.onUpdated(data as BusinessRow)
                    setSuccess('Galleria aggiornata.')
                  } catch (err: unknown) {
                    setError(errorMessage(err, 'Errore upload galleria.'))
                  } finally {
                    setUploadingGallery(false)
                  }
                })()
              }}
            />
            <div className="text-xs text-white/60">Max 8 per volta.</div>
          </div>
          <textarea
            value={galleryText}
            onChange={(e) => setGalleryText(e.target.value)}
            rows={4}
            placeholder="https://...\nhttps://..."
            className="tb-input mt-2 resize-none"
          />
          {galleryText.trim() && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {galleryText
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 8)
                .map((url) => (
                  <div key={url} className="relative">
                    <MediaThumb
                      src={url}
                      alt={`Anteprima galleria ${b.name}`}
                      fallbackLabel={b.name}
                      zoom
                      containerClassName="h-24 w-full"
                    />
                    <button
                      type="button"
                      disabled={saving || uploadingGallery}
                      onClick={() => {
                        const next = galleryText
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .filter((x) => x !== url)
                          .join('\n')
                        setGalleryText(next)
                      }}
                      className={cn(
                        'absolute right-2 top-2 z-10 inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/40 p-2 text-white/80 shadow-lg backdrop-blur-sm transition hover:bg-black/60',
                        (saving || uploadingGallery) && 'cursor-not-allowed opacity-60',
                      )}
                      aria-label="Rimuovi"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div id="business-description" className="md:col-span-2">
          <label className="tb-label">Descrizione</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="tb-input mt-1 resize-none"
          />
        </div>

        <div id="business-location">
          <label className="tb-label">Indirizzo</label>
          <Input
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="tb-label">CAP</label>
          <Input
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="tb-label">Città</label>
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="tb-label">Fuso orario (IANA)</label>
          <Input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Europe/Rome"
            className="mt-1"
            list="timezone-hints"
          />
          <datalist id="timezone-hints">
            <option value="Europe/Rome" />
            <option value="Europe/Paris" />
            <option value="Europe/London" />
            <option value="America/New_York" />
          </datalist>
        </div>

        <div>
          <label className="tb-label">Telefono</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="tb-label">Email</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="tb-label">Sito web</label>
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 md:col-span-2">
          <div>
            <label className="tb-label">Lat</label>
            <Input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="tb-label">Lng</label>
            <Input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <div
        id="anti-noshow-policy"
        className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4"
      >
        <div className="tb-kicker text-amber-200/90">CONTROLLO NO-SHOW (REGOLE HARD)</div>
        <p className="mt-2 text-xs leading-relaxed text-white/75">
          Qui sotto imposti cosa succede prima della prenotazione: affidabilità minima, storico no-show del cliente e finestre temporali.
          La suite KPI, playbook verticale e agente AI (solo whitelist RPC) sono in{' '}
          <a href="#ecosistema-prenotazioni" className="font-semibold text-[#4F7CFF] underline underline-offset-2 hover:text-white">
            Ecosistema prenotazioni
          </a>
          .
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="tb-kicker">APPROVAZIONE E REGOLE CANCELLAZIONE</div>
          <div className="mt-2 grid grid-cols-1 gap-3">
            <div>
              <label className="tb-label">Modalità</label>
              <Select
                value={approvalMode}
                onChange={(e) => setApprovalMode(e.target.value as BusinessRow['approval_mode'])}
                className="mt-1"
              >
                <option value="auto">Auto</option>
                <option value="manual">Manuale</option>
                <option value="risk_based">In base al rischio</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="tb-label">Min affidabilità</label>
                <Input
                  value={requiredReliabilityMin}
                  onChange={(e) => setRequiredReliabilityMin(e.target.value)}
                  inputMode="numeric"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="tb-label">Finestra cancellazione (min)</label>
                <Input
                  value={cancellationWindowMin}
                  onChange={(e) => setCancellationWindowMin(e.target.value)}
                  inputMode="numeric"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="tb-label">Soglia affidabilità (blocco richiesta)</label>
                <Input
                  value={blockReliabilityThreshold}
                  onChange={(e) => setBlockReliabilityThreshold(e.target.value)}
                  inputMode="numeric"
                  className="mt-1"
                />
                <div className="mt-1 text-[10px] text-white/60">
                  Il cliente viene bloccato se il suo punteggio effettivo è <span className="text-white/75">inferiore</span> a questo valore (0–100). Valori più alti =
                  policy più stretta.
                </div>
              </div>
              <div>
                <label className="tb-label">Max no-show storico prima del blocco</label>
                <Input
                  value={autoBlockNoShowCount}
                  onChange={(e) => setAutoBlockNoShowCount(e.target.value)}
                  inputMode="numeric"
                  className="mt-1"
                />
                <div className="mt-1 text-[10px] text-white/60">
                  Se il conteggio storico no-show del cliente raggiunge questo numero, nuove richieste sono respinte. Numeri più bassi = più severità.
                </div>
              </div>
            </div>

            <div>
              <label className="tb-label">Anticipo minimo prenotazione (min)</label>
              <Input
                value={bookingLeadTimeMin}
                onChange={(e) => setBookingLeadTimeMin(e.target.value)}
                inputMode="numeric"
                className="mt-1"
              />
              <div className="mt-1 text-[10px] text-white/60">Blocca prenotazioni troppo a ridosso e richieste cambio orario last minute.</div>
            </div>

            <div>
              <label className="tb-label">Tempo minimo tra prenotazioni (min)</label>
              <Input
                value={minGapMin}
                onChange={(e) => setMinGapMin(e.target.value)}
                inputMode="numeric"
                className="mt-1"
              />
              <div className="mt-1 text-[10px] text-white/60">Aggiunge un buffer tra uno slot e il successivo.</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#4F7CFF]/30 bg-[#4F7CFF]/5 p-4 relative overflow-hidden">
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
        </div>
      </div>
    </Card>
    <div id="ecosistema-prenotazioni">
      <BusinessEcosystemSection business={b} featureGate={props.featureGate} floorPlanInitialTab={floorPlanInitialTab} />
    </div>
    <Modal
      open={wizardOpen}
      title="Guida profilo pubblico"
      description="Completa i dettagli che fanno la differenza: foto, descrizione, servizi, orari, planimetria e URL condivisibile."
      onClose={() => setWizardOpen(false)}
      className="max-w-2xl"
    >
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-white">Link pubblico</div>
          <div className="mt-1 text-xs text-white/70 break-all">{publicUrl}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
              disabled={!listingVisible}
            >
              Apri
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(publicUrl)
                    setSuccess('Link copiato.')
                  } catch {
                    setError('Impossibile copiare il link su questo browser.')
                  }
                })()
              }}
            >
              Copia
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Checklist</div>
              <div className="mt-1 text-xs text-white/70">{`${profileCompletion.pct}% · ${profileCompletion.done}/${profileCompletion.total}`}</div>
            </div>
            <Button type="button" variant="secondary" onClick={() => setWizardOpen(false)}>
              Chiudi
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {profileCompletion.items.map((it) => {
              const go = () => {
                setWizardOpen(false)
                const toId =
                  it.key === 'name'
                    ? 'business-name'
                    : it.key === 'slug'
                      ? 'business-public-url'
                      : it.key === 'logo'
                        ? 'business-logo'
                        : it.key === 'gallery'
                          ? 'business-gallery'
                          : it.key === 'desc'
                            ? 'business-description'
                            : it.key === 'address' || it.key === 'geo'
                              ? 'business-location'
                              : null
                if (toId) {
                  window.setTimeout(() => {
                    document.getElementById(toId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 50)
                  return
                }
                if (it.key === 'services') {
                  nav('/dashboard-attivita?tab=servizi')
                  return
                }
                if (it.key === 'hours') {
                  nav('/dashboard-attivita?tab=orari')
                  return
                }
                if (it.key === 'floorPlan') {
                  nav('/dashboard-attivita?tab=impostazioni&section=ecosistema&fpTab=editor')
                  return
                }
              }

              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={go}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition',
                    it.ok ? 'border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
                  )}
                >
                  <div className="text-xs font-semibold text-white">{it.label}</div>
                  <div className={cn('text-[11px] font-semibold', it.ok ? 'text-emerald-100' : 'text-white/60')}>
                    {it.ok ? 'OK' : 'Completa'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
    </>
  )
}
