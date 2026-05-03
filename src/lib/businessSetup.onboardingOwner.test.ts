import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createBusinessWithDefaults } from '@/lib/businessSetup'

type MockState = {
  rpcError: Error | null
  rpcCalls: Array<{ fn: string; payload: unknown }>
}

const { state, mockSupabase } = vi.hoisted(() => {
  const initial: MockState = {
    rpcError: null,
    rpcCalls: [],
  }
  const supabase = {
    rpc: async (fn: string, payload: unknown) => {
      initial.rpcCalls.push({ fn, payload })
      return initial.rpcError ? { data: null, error: initial.rpcError } : { data: { id: 'biz-1' }, error: null }
    },
    from: vi.fn((table: string) => {
      if (table === 'team_members') {
        return {
          insert: async () => ({ error: null }),
        }
      }
      throw new Error(`Unexpected table mock: ${table}`)
    }),
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  }
  return { state: initial, mockSupabase: supabase }
})

const runtimeSupabase = {
  rpc: async (fn: string, payload: unknown) => {
    state.rpcCalls.push({ fn, payload })
    return state.rpcError ? { data: null, error: state.rpcError } : { data: { id: 'biz-1' }, error: null }
  },
  from: vi.fn((table: string) => {
    if (table === 'team_members') {
      return {
        insert: async () => ({ error: null }),
      }
    }
    throw new Error(`Unexpected table mock: ${table}`)
  }),
  auth: {
    getSession: async () => ({ data: { session: null } }),
  },
}

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase ?? runtimeSupabase,
}))

describe('owner onboarding business setup', () => {
  beforeEach(() => {
    state.rpcError = null
    state.rpcCalls = []
  })

  test('creates business with real services and schedule', async () => {
    const business = await createBusinessWithDefaults({
      ownerUserId: 'owner-1',
      input: {
        name: 'Barberia Test',
        category: 'parrucchiere',
        description: 'Descrizione',
        addressText: 'Via Roma 1',
        postalCode: '20100',
        city: 'Milano',
        phone: '+3902000000',
        email: 'owner@test.it',
        website: 'https://barberia.test',
        lat: 45.46,
        lng: 9.19,
        logoUrl: '',
        galleryUrls: [],
        isPaused: false,
        minGapMin: 10,
        approvalMode: 'risk_based',
        requiredReliabilityMin: 70,
        cancellationWindowMin: 120,
        depositMode: 'risk_based',
        depositValueType: 'percentage',
        depositFixedCents: 500,
        depositPercent: 20,
        depositMinCents: 500,
        depositMaxCents: 3000,
        depositGreenRule: { type: 'percentage', value: 0 },
        depositYellowRule: { type: 'percentage', value: 20 },
        depositRedRule: { type: 'percentage', value: 50 },
        manualApprovalForHighRisk: true,
        cancellationFreeUntilHours: 24,
        refundPolicy: 'flexible',
        depositRetainedOnNoShow: true,
        depositRetainedOnLateCancel: true,
        services: [{ name: 'Taglio uomo', durationMin: 30, priceCents: 2500 }],
        schedule: {
          1: [{ start: '09:00', end: '13:00' }],
          2: [{ start: '15:00', end: '19:00' }],
        },
        staffEmails: [],
      },
    })

    expect(business.id).toBe('biz-1')
    expect(state.rpcCalls.at(0)?.fn).toBe('create_business_with_defaults')
    expect(state.rpcCalls.at(0)?.payload).toEqual(
      expect.objectContaining({
        p_input: expect.objectContaining({
          name: 'Barberia Test',
          services: expect.any(Array),
          schedule: expect.any(Object),
        }),
      }),
    )
  })

  test('invites staff by email best-effort', async () => {
    await createBusinessWithDefaults({
      ownerUserId: 'owner-1',
      input: {
        name: 'Barberia Test',
        category: 'parrucchiere',
        description: '',
        addressText: 'Via Roma 1',
        postalCode: '20100',
        city: 'Milano',
        phone: '',
        email: '',
        website: '',
        lat: 45.46,
        lng: 9.19,
        logoUrl: '',
        galleryUrls: [],
        isPaused: false,
        minGapMin: 5,
        approvalMode: 'risk_based',
        requiredReliabilityMin: 70,
        cancellationWindowMin: 120,
        depositMode: 'none',
        depositValueType: 'percentage',
        depositFixedCents: 0,
        depositPercent: 0,
        depositMinCents: 0,
        depositMaxCents: 0,
        depositGreenRule: { type: 'percentage', value: 0 },
        depositYellowRule: { type: 'percentage', value: 0 },
        depositRedRule: { type: 'percentage', value: 0 },
        manualApprovalForHighRisk: false,
        cancellationFreeUntilHours: 24,
        refundPolicy: 'flexible',
        depositRetainedOnNoShow: false,
        depositRetainedOnLateCancel: false,
        services: [{ name: 'Taglio', durationMin: 30, priceCents: null }],
        schedule: { 1: [{ start: '09:00', end: '13:00' }] },
        staffEmails: ['a@test.it', 'b@test.it'],
      },
    })

    expect(state.rpcCalls[0]?.fn).toBe('create_business_with_defaults')
    const inviteCalls = state.rpcCalls.filter((c) => c.fn === 'business_add_staff_by_email')
    expect(inviteCalls).toHaveLength(2)
  })

  test('fails when RPC fails', async () => {
    state.rpcError = new Error('rpc failed')

    await expect(
      createBusinessWithDefaults({
        ownerUserId: 'owner-1',
        input: {
          name: 'Barberia Test',
          category: 'parrucchiere',
          description: '',
          addressText: 'Via Roma 1',
          postalCode: '20100',
          city: 'Milano',
          phone: '',
          email: '',
          website: '',
          lat: 45.46,
          lng: 9.19,
          logoUrl: '',
          galleryUrls: [],
          isPaused: false,
          minGapMin: 5,
          approvalMode: 'risk_based',
          requiredReliabilityMin: 70,
          cancellationWindowMin: 120,
          depositMode: 'none',
          depositValueType: 'percentage',
          depositFixedCents: 0,
          depositPercent: 0,
          depositMinCents: 0,
          depositMaxCents: 0,
          depositGreenRule: { type: 'percentage', value: 0 },
          depositYellowRule: { type: 'percentage', value: 0 },
          depositRedRule: { type: 'percentage', value: 0 },
          manualApprovalForHighRisk: false,
          cancellationFreeUntilHours: 24,
          refundPolicy: 'flexible',
          depositRetainedOnNoShow: false,
          depositRetainedOnLateCancel: false,
          services: [{ name: 'Taglio', durationMin: 30, priceCents: null }],
          schedule: { 1: [{ start: '09:00', end: '13:00' }] },
          staffEmails: [],
        },
      }),
    ).rejects.toThrow('rpc failed')
  })
})
