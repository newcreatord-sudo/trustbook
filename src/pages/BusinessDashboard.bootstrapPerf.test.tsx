import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import BusinessDashboard from '@/pages/BusinessDashboard'
import { useAuth } from '@/providers/authContext'

const QUERY_DELAY_MS = 90
const PERF_BUDGET_MS = 820

const tableStartedAt = new Map<string, number>()
const tableResolvedAt = new Map<string, number>()

function nowMs() {
  return performance.now()
}

function markStarted(table: string) {
  if (!tableStartedAt.has(table)) tableStartedAt.set(table, nowMs())
}

function markResolved(table: string) {
  tableResolvedAt.set(table, nowMs())
}

function responseForTable(table: string) {
  const payloadByTable: Record<string, unknown[]> = {
    businesses: [
      {
        id: 'biz-1',
        owner_user_id: 'owner-1',
        name: 'Business Test',
        created_at: '2026-01-01T10:00:00.000Z',
      },
    ],
    team_members: [],
    bookings: [
      {
        id: 'bk-1',
        business_id: 'biz-1',
        customer_user_id: 'cust-1',
        service_id: 'svc-1',
        start_at: '2026-01-10T09:00:00.000Z',
        end_at: '2026-01-10T10:00:00.000Z',
        status: 'accepted',
        created_at: '2026-01-01T09:00:00.000Z',
      },
    ],
    services: [{ id: 'svc-1', business_id: 'biz-1', name: 'Taglio', created_at: '2026-01-01T08:00:00.000Z' }],
    business_opening_windows: [
      {
        id: 'w-1',
        business_id: 'biz-1',
        weekday: 1,
        start_time: '09:00:00',
        end_time: '18:00:00',
      },
    ],
    business_closures: [],
    reviews: [{ booking_id: 'bk-1', direction: 'business_to_customer' }],
    customer_reliability: [
      {
        user_id: 'cust-1',
        score: 80,
        stars: 4,
        no_show_count: 0,
        late_cancel_count: 0,
      },
    ],
    profiles: [{ id: 'cust-1', first_name: 'Mario', last_name: 'Rossi', phone: null }],
    business_customer_tags: [{ id: 't-1', business_id: 'biz-1', customer_user_id: 'cust-1', tag: 'vip' }],
    booking_internal_notes: [{ booking_id: 'bk-1', body: 'Nota interna' }],
    business_customer_blocks: [],
  }

  const payload = payloadByTable[table] ?? []
  const delay = table === 'businesses' || table === 'team_members' || table === 'business_customer_blocks' ? QUERY_DELAY_MS : 1
  return new Promise<{ data: unknown[]; error: null }>((resolve) => {
    setTimeout(() => {
      markResolved(table)
      resolve({ data: payload, error: null })
    }, delay)
  })
}

function createThenableQuery(table: string) {
  let executed: Promise<{ data: unknown[]; error: null }> | null = null
  const execute = () => {
    if (!executed) {
      markStarted(table)
      executed = responseForTable(table)
    }
    return executed
  }

  const builder: {
    select: (..._args: unknown[]) => typeof builder
    eq: (..._args: unknown[]) => typeof builder
    order: (..._args: unknown[]) => typeof builder
    limit: (..._args: unknown[]) => typeof builder
    range: (..._args: unknown[]) => typeof builder
    in: (..._args: unknown[]) => typeof builder
    then: Promise<{ data: unknown[]; error: null }>['then']
  } = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    in: () => builder,
    then: (onFulfilled, onRejected) => execute().then(onFulfilled, onRejected),
  }
  return builder
}

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/providers/authContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/supabase', () => {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  }
  function responseForBootstrap() {
    markStarted('rpc_bootstrap')
    return new Promise<{ data: unknown; error: null }>((resolve) => {
      setTimeout(() => {
        markResolved('rpc_bootstrap')
        resolve({
          data: {
            bookings: [
              {
                id: 'bk-1',
                business_id: 'biz-1',
                customer_user_id: 'cust-1',
                service_id: 'svc-1',
                start_at: '2026-01-10T09:00:00.000Z',
                end_at: '2026-01-10T10:00:00.000Z',
                status: 'accepted',
                created_at: '2026-01-01T09:00:00.000Z',
              },
            ],
            has_more: false,
            next_cursor: null,
            services: [{ id: 'svc-1', business_id: 'biz-1', name: 'Taglio', created_at: '2026-01-01T08:00:00.000Z' }],
            opening_windows: [
              {
                id: 'w-1',
                business_id: 'biz-1',
                weekday: 1,
                start_time: '09:00:00',
                end_time: '18:00:00',
              },
            ],
            closures: [],
            reviewed_booking_ids: ['bk-1'],
            reliability_by_user_id: {
              'cust-1': { score: 80, stars: 4, no_show_count: 0, late_cancel_count: 0 },
            },
            profiles_by_id: { 'cust-1': { first_name: 'Mario', last_name: 'Rossi', phone: null } },
            tags_by_user_id: { 'cust-1': ['vip'] },
            booking_has_note: { 'bk-1': true },
            kpis: {
              timezone: 'Europe/Rome',
              today_active_count: 0,
              upcoming_7_active_count: 0,
              pending_pipeline_count: 0,
              last30: {
                completed: 0,
                no_show: 0,
                late_cancel: 0,
                show_denominator: 0,
                forfeited_deposit_cents: 0,
                forfeited_deposit_cases: 0,
              },
            },
          },
          error: null,
        })
      }, QUERY_DELAY_MS)
    })
  }
  return {
    supabase: {
      from: vi.fn((table: string) => createThenableQuery(table)),
      rpc: vi.fn(async (fnName: string) => {
        if (fnName === 'business_dashboard_bootstrap_v1') return responseForBootstrap()
        return { data: null, error: null }
      }),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => ({ error: null })),
    },
  }
})
vi.mock('@/pages/dashboard/BusinessSettingsPanel', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/ServicesManager', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/ScheduleManager', () => ({ default: () => null }))
vi.mock('@/components/BookingChat', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/StaffManager', () => ({ default: () => null }))
vi.mock('@/components/OwnerOnlyPanel', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/pages/dashboard/BookingFiltersBar', () => ({
  default: () => null,
}))
vi.mock('@/pages/dashboard/BookingQuickRow', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BookingInternalNote', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/CustomerTags', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BookingTimeline', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BusinessCalendarView', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BusinessHealthPanel', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BusinessAlertsPanel', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BusinessAiSuggestionsPanel', () => ({ default: () => null }))

describe('BusinessDashboard bootstrap performance budget', () => {
  beforeEach(() => {
    tableStartedAt.clear()
    tableResolvedAt.clear()
    vi.clearAllMocks()
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'owner-1' }, access_token: 'token' },
      profile: { role: 'attivita' },
      loading: false,
    })
  })

  test('keeps staged bootstrap parallel under runtime budget', async () => {
    const startedAt = nowMs()

    const { unmount } = render(
      <MemoryRouter>
        <BusinessDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(tableResolvedAt.has('rpc_bootstrap')).toBe(true)
      expect(tableResolvedAt.has('businesses')).toBe(true)
    })

    const elapsedMs = nowMs() - startedAt
    expect(elapsedMs).toBeLessThan(PERF_BUDGET_MS)

    unmount()
    await new Promise((resolve) => setTimeout(resolve, 300))
  })
})
