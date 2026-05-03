import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import type { BusinessRow } from '@/domain/supabase'
import type { BusinessFeatureGate } from '@/lib/subscriptions'
import BusinessEcosystemSection from '@/components/BusinessEcosystemSection'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { uploadBusinessMedia } from '@/lib/storage'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [name, setName] = useState(b.name)
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

  useEffect(() => {
    setName(b.name)
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
      autoBlockNoShowCount !== String(b.auto_block_no_show_count ?? 3)
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

            setSaving(true)
            ;(async () => {
              try {
                const galleryUrls = galleryText
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
                const { data, error } = await supabase
                  .from('businesses')
                  .update({
                    name: name.trim(),
                    category,
                    description: description.trim() || null,
                    address_text: addressText.trim() || null,
                    postal_code: postalCode.trim() || null,
                    city: city.trim() || null,
                    timezone: timezone.trim() || 'Europe/Rome',
                    phone: phone.trim() || null,
                    email: email.trim() || null,
                    website: website.trim() || null,
                    logo_url: logoUrl.trim() || null,
                    gallery_urls: galleryUrls,
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
                  })
                  .eq('id', b.id)
                  .select('*')
                  .single()
                if (error) throw error
                props.onUpdated(data as BusinessRow)
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

        <div>
          <label className="tb-label">Nome attività</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
          />
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

        <div>
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
            <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3">
              <img src={logoUrl.trim()} alt="Logo" className="h-16 w-16 rounded-xl object-cover" />
            </div>
          )}
        </div>

        <div className="md:col-span-2">
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
                  <div key={url} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    <img src={url} alt="Foto" className="h-24 w-full object-cover" />
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
                        'absolute right-2 top-2 inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/40 p-2 text-white/80 transition hover:bg-black/60',
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

        <div className="md:col-span-2">
          <label className="tb-label">Descrizione</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="tb-input mt-1 resize-none"
          />
        </div>

        <div>
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
      <BusinessEcosystemSection business={b} featureGate={props.featureGate} />
    </div>
    </>
  )
}
