import { supabase } from '@/lib/supabase'

export type BusinessLiveOverviewRow = {
  business_id: string
  business_name: string
  timezone: string
  pending_pipeline_count: number
  today_active_count: number
  upcoming_7_active_count: number
  last30_completed: number
  last30_no_show: number
  last30_late_cancel: number
  last30_show_denominator: number
  last30_forfeited_deposit_cents: number
  last30_forfeited_deposit_cases: number
  estimated_revenue_today_cents: number
  occupied_resource_count: number
  total_active_resources: number
  avg_rating_last30: number | null
  reviews_last30: number
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function parseBusinessLiveOverviewRow(raw: unknown): BusinessLiveOverviewRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.business_id)
  if (!id) return null
  return {
    business_id: id,
    business_name: str(r.business_name),
    timezone: str(r.timezone),
    pending_pipeline_count: num(r.pending_pipeline_count),
    today_active_count: num(r.today_active_count),
    upcoming_7_active_count: num(r.upcoming_7_active_count),
    last30_completed: num(r.last30_completed),
    last30_no_show: num(r.last30_no_show),
    last30_late_cancel: num(r.last30_late_cancel),
    last30_show_denominator: num(r.last30_show_denominator),
    last30_forfeited_deposit_cents: num(r.last30_forfeited_deposit_cents),
    last30_forfeited_deposit_cases: num(r.last30_forfeited_deposit_cases),
    estimated_revenue_today_cents: num(r.estimated_revenue_today_cents),
    occupied_resource_count: num(r.occupied_resource_count),
    total_active_resources: num(r.total_active_resources),
    avg_rating_last30: typeof r.avg_rating_last30 === 'number' && Number.isFinite(r.avg_rating_last30) ? r.avg_rating_last30 : null,
    reviews_last30: num(r.reviews_last30),
  }
}

export async function fetchBusinessLiveOverview(params?: { at?: string }): Promise<BusinessLiveOverviewRow[]> {
  const { data, error } = await supabase.rpc('list_business_live_overview', {
    p_at: params?.at ?? new Date().toISOString(),
  })
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  return rows.map(parseBusinessLiveOverviewRow).filter((x): x is BusinessLiveOverviewRow => x !== null)
}

