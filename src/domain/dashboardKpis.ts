export type DashboardBookingKpis = {
  timezone: string
  today_active_count: number
  upcoming_7_active_count: number
  pending_pipeline_count: number
  last30: {
    completed: number
    no_show: number
    late_cancel: number
    show_denominator: number
    forfeited_deposit_cents: number
    forfeited_deposit_cases: number
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function parseDashboardBookingKpis(raw: unknown): DashboardBookingKpis | null {
  if (!raw || typeof raw !== 'object') return null
  const root = raw as Record<string, unknown>
  const last = root.last30
  if (!last || typeof last !== 'object') return null
  const L = last as Record<string, unknown>
  return {
    timezone: str(root.timezone),
    today_active_count: num(root.today_active_count),
    upcoming_7_active_count: num(root.upcoming_7_active_count),
    pending_pipeline_count: num(root.pending_pipeline_count),
    last30: {
      completed: num(L.completed),
      no_show: num(L.no_show),
      late_cancel: num(L.late_cancel),
      show_denominator: num(L.show_denominator),
      forfeited_deposit_cents: num(L.forfeited_deposit_cents),
      forfeited_deposit_cases: num(L.forfeited_deposit_cases),
    },
  }
}
