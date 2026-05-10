import type { BusinessRow } from '@/domain/supabase'
import { supabase } from '@/lib/supabase'

export type BusinessOnboardingInput = {
  name: string
  category: string
  description: string
  addressText: string
  postalCode: string
  city: string
  phone: string
  email: string
  website: string
  lat: number
  lng: number
  logoUrl: string | null
  galleryUrls: string[]
  isPaused: boolean
  minGapMin: number
  approvalMode: BusinessRow['approval_mode']
  requiredReliabilityMin: number
  cancellationWindowMin: number
  depositMode: 'none' | 'everyone' | 'risk_based' | 'dynamic'
  depositValueType: 'percentage' | 'fixed_amount'
  depositFixedCents: number
  depositPercent: number
  depositMinCents: number
  depositMaxCents: number
  depositGreenRule: { type: 'percentage' | 'fixed_amount'; value: number }
  depositYellowRule: { type: 'percentage' | 'fixed_amount'; value: number }
  depositRedRule: { type: 'percentage' | 'fixed_amount'; value: number }
  manualApprovalForHighRisk: boolean
  cancellationFreeUntilHours: number
  refundPolicy: 'flexible' | 'moderate' | 'strict' | 'non_refundable'
  depositRetainedOnNoShow: boolean
  depositRetainedOnLateCancel: boolean
  services: Array<{ name: string; durationMin: number; priceCents: number | null }>
  schedule: Record<number, Array<{ start: string; end: string }>>
  staffEmails: string[]
}

export async function createBusinessWithDefaults(params: {
  ownerUserId: string
  input: BusinessOnboardingInput
}): Promise<BusinessRow> {
  const { ownerUserId, input } = params

  const fixed = Math.max(0, Math.floor(input.depositFixedCents || 0))
  const percent = Math.max(0, Math.min(100, Math.floor(input.depositPercent || 0)))
  const minCents = Math.max(0, Math.floor(input.depositMinCents || 0))
  const maxCents = Math.max(0, Math.floor(input.depositMaxCents || 0))

  const { data, error } = await supabase.rpc('create_business_with_defaults', {
    p_input: {
      ...input,
      ownerUserId,
      depositFixedCents: fixed,
      depositPercent: percent,
      depositMinCents: minCents,
      depositMaxCents: maxCents,
    },
  })
  if (error) throw error
  const business = data as BusinessRow

  if (input.staffEmails.length > 0) {
    for (const email of input.staffEmails) {
      try {
        await supabase.rpc('business_add_staff_by_email', {
          p_business_id: business.id,
          p_email: email,
        })
      } catch {
        // Staff invitation is optional: continue without blocking onboarding.
      }
    }
  }

  return business
}

export async function claimExternalBusinessListing(params: {
  listingId: string
  input: BusinessOnboardingInput
}): Promise<BusinessRow> {
  const { listingId, input } = params

  const fixed = Math.max(0, Math.floor(input.depositFixedCents || 0))
  const percent = Math.max(0, Math.min(100, Math.floor(input.depositPercent || 0)))
  const minCents = Math.max(0, Math.floor(input.depositMinCents || 0))
  const maxCents = Math.max(0, Math.floor(input.depositMaxCents || 0))

  const { data, error } = await supabase.rpc('claim_external_business_listing', {
    p_listing_id: listingId,
    p_overrides: {
      ...input,
      depositFixedCents: fixed,
      depositPercent: percent,
      depositMinCents: minCents,
      depositMaxCents: maxCents,
    },
  })
  if (error) throw error
  const business = data as BusinessRow

  if (input.staffEmails.length > 0) {
    for (const email of input.staffEmails) {
      try {
        await supabase.rpc('business_add_staff_by_email', {
          p_business_id: business.id,
          p_email: email,
        })
      } catch {
        continue
      }
    }
  }

  return business
}
