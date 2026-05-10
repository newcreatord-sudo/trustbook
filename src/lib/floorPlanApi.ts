import { supabase } from '@/lib/supabase'

export type ResourceKind = 'table' | 'room' | 'chair' | 'station' | 'equipment' | 'seat'

export type CustomerTableChoice = 'off' | 'preferred' | 'required'

export type TableAssignmentMode = 'auto' | 'customer_choice'

export interface LayoutNode {
  id: string
  resource_id: string
  type: 'table' | 'station' | 'seat'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zone: string
  shape: 'rect' | 'circle' | 'booth'
  label: string
}

export interface LayoutBounds {
  width_px: number
  height_px: number
}

export interface LayoutGrid {
  columns: number
  rows: number
}

export interface LayoutJson {
  version: number
  bounds: LayoutBounds
  grid?: LayoutGrid
  background?: {
    bucket: 'business-private'
    path: string
    opacity?: number
    fit?: 'contain' | 'cover'
  } | null
  nodes: LayoutNode[]
  walls: unknown[]
  annotations: unknown[]
}

export interface FloorPlanRow {
  id: string
  business_id: string
  name: string
  layout_json: LayoutJson
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BookingResourceRow {
  id: string
  business_id: string
  floor_plan_id: string | null
  kind: ResourceKind
  label: string
  capacity_min: number
  capacity_max: number
  position_json: Record<string, unknown>
  metadata: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BookingResourceAssignmentRow {
  booking_id: string
  primary_resource_id: string | null
  party_size: number | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface FloorPlanBundle {
  floor_plan_id: string
  floor_plan_name: string
  floor_plan_is_active: boolean
  layout_json: LayoutJson
  resources_json: Array<{
    id: string
    label: string
    kind: ResourceKind
    capacity_min: number
    capacity_max: number
    is_active: boolean
    position_json: Record<string, unknown>
    floor_plan_id: string | null
    metadata: Record<string, unknown>
  }>
  resource_count: number
}

export interface AvailableResource {
  resource_id: string
  label: string
  kind: ResourceKind
  capacity_min: number
  capacity_max: number
  zone: string
  position_json: Record<string, unknown>
  floor_plan_name: string
  floor_plan_id: string | null
}

export interface AiSuggestedResource {
  suggested_resource_id: string
  score: number
  reason: string
  label: string
  capacity_min: number
  capacity_max: number
  zone: string
}

export interface OccupiedResourceAt {
  resource_id: string
  resource_label: string
  floor_plan_id: string | null
  booking_id: string
  start_at: string
  end_at: string
  status: string
}

export interface PublicFloorPlanBundle {
  floor_plan_id: string
  floor_plan_name: string
  floor_plan_is_active: boolean
  layout_json: LayoutJson
  resources_json: Array<{
    id: string
    label: string
    kind: ResourceKind
    capacity_min: number
    capacity_max: number
  }>
  resource_count: number
}

/** Limite nodi salvati per piano (payload sicuro / prestazioni JSON). */
export const MAX_LAYOUT_NODES = 400

const MIN_NODE_DIM_NORM = 0.02
const MAX_CANVAS_PX = 4096

/** Normalizza coordinate e dimensioni prima di `upsert_floor_plan`. */
export function sanitizeLayoutJson(layout: LayoutJson): LayoutJson {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
  const clampDim = (v: number) =>
    Math.min(1, Math.max(MIN_NODE_DIM_NORM, Number.isFinite(v) ? v : MIN_NODE_DIM_NORM))

  const nodes = layout.nodes.slice(0, MAX_LAYOUT_NODES).map((n) => {
    let x = clamp01(n.x)
    let y = clamp01(n.y)
    const width = clampDim(n.width)
    const height = clampDim(n.height)
    x = Math.min(x, 1 - width)
    y = Math.min(y, 1 - height)
    let rotation = typeof n.rotation === 'number' && Number.isFinite(n.rotation) ? n.rotation % 360 : 0
    if (rotation > 180) rotation -= 360
    if (rotation <= -180) rotation += 360
    const rid = typeof n.resource_id === 'string' ? n.resource_id : ''
    const nid = typeof n.id === 'string' && n.id.length > 0 ? n.id : `node-${rid || Math.random().toString(36).slice(2)}`
    const t = n.type === 'station' || n.type === 'seat' ? n.type : ('table' as const)
    const shape = (n.shape === 'circle' || n.shape === 'booth' ? n.shape : 'rect') as LayoutNode['shape']
    const zone = typeof n.zone === 'string' ? n.zone.slice(0, 120) : 'default'
    const label = typeof n.label === 'string' ? n.label.slice(0, 80) : 'T'
    return {
      ...n,
      id: nid,
      resource_id: rid,
      type: t,
      x,
      y,
      width,
      height,
      rotation,
      zone,
      shape,
      label,
    }
  })

  const bw = typeof layout.bounds?.width_px === 'number' ? layout.bounds.width_px : 800
  const bh = typeof layout.bounds?.height_px === 'number' ? layout.bounds.height_px : 600

  return {
    ...layout,
    version: typeof layout.version === 'number' ? layout.version : 1,
    bounds: {
      width_px: Math.min(MAX_CANVAS_PX, Math.max(320, Math.floor(Number.isFinite(bw) ? bw : 800))),
      height_px: Math.min(MAX_CANVAS_PX, Math.max(240, Math.floor(Number.isFinite(bh) ? bh : 600))),
    },
    nodes,
    walls: Array.isArray(layout.walls) ? layout.walls.slice(0, 2000) : [],
    annotations: Array.isArray(layout.annotations) ? layout.annotations.slice(0, 500) : [],
  }
}

export function parseLayoutJson(raw: unknown): LayoutJson {
  if (typeof raw !== 'object' || raw === null) {
    return { version: 0, bounds: { width_px: 800, height_px: 600 }, nodes: [], walls: [], annotations: [] }
  }
  const r = raw as Record<string, unknown>
  const version = typeof r.version === 'number' ? r.version : 0
  const bounds = (r.bounds && typeof r.bounds === 'object'
    ? (r.bounds as unknown as LayoutBounds)
    : { width_px: 800, height_px: 600 })
  const nodes = Array.isArray(r.nodes)
    ? r.nodes.map((n): LayoutNode => {
        const node = n as Record<string, unknown>
        const t = node.type
        const type: LayoutNode['type'] = t === 'station' || t === 'seat' || t === 'table' ? t : 'table'
        return {
          id: typeof node.id === 'string' ? node.id : '',
          resource_id: typeof node.resource_id === 'string' ? node.resource_id : '',
          type,
          x: typeof node.x === 'number' ? node.x : 0,
          y: typeof node.y === 'number' ? node.y : 0,
          width: typeof node.width === 'number' ? node.width : 0.1,
          height: typeof node.height === 'number' ? node.height : 0.08,
          rotation: typeof node.rotation === 'number' ? node.rotation : 0,
          zone: typeof node.zone === 'string' ? node.zone : 'default',
          shape: (node.shape === 'circle' || node.shape === 'booth' ? node.shape : 'rect') as LayoutNode['shape'],
          label: typeof node.label === 'string' ? node.label : 'T',
        }
      })
    : []
  const bgRaw = r.background
  const background =
    typeof bgRaw === 'object' && bgRaw !== null && !Array.isArray(bgRaw)
      ? (() => {
          const b = bgRaw as Record<string, unknown>
          const bucket = b.bucket === 'business-private' ? ('business-private' as const) : null
          const path = typeof b.path === 'string' ? b.path : null
          if (!bucket || !path) return null
          const opacity = typeof b.opacity === 'number' && Number.isFinite(b.opacity) ? Math.max(0, Math.min(1, b.opacity)) : undefined
          const fit = b.fit === 'contain' || b.fit === 'cover' ? (b.fit as 'contain' | 'cover') : undefined
          return { bucket, path, opacity, fit }
        })()
      : null
  return {
    version,
    bounds: {
      width_px: typeof bounds.width_px === 'number' ? bounds.width_px : 800,
      height_px: typeof bounds.height_px === 'number' ? bounds.height_px : 600,
    },
    background,
    nodes,
    walls: Array.isArray(r.walls) ? r.walls : [],
    annotations: Array.isArray(r.annotations) ? r.annotations : [],
  }
}

export async function getFloorPlanPreviewForCustomerBooking(
  businessId: string,
  floorPlanId: string,
): Promise<{ layout_json: LayoutJson; resources_json: FloorPlanBundle['resources_json'] } | null> {
  const { data, error } = await supabase.rpc('get_floor_plan_preview_for_customer_booking', {
    p_business_id: businessId,
    p_floor_plan_id: floorPlanId,
  })
  if (error) throw error
  const rows = data as Array<{ layout_json: unknown; resources_json: unknown }> | null | undefined
  const row = rows?.[0]
  if (!row) return null
  const rj = row.resources_json
  return {
    layout_json: parseLayoutJson(row.layout_json),
    resources_json: Array.isArray(rj) ? (rj as FloorPlanBundle['resources_json']) : [],
  }
}

export async function getFloorPlanBundle(
  businessId: string,
  floorPlanId?: string,
): Promise<FloorPlanBundle[]> {
  const { data, error } = await supabase.rpc('get_floor_plan_bundle', {
    p_business_id: businessId,
    p_floor_plan_id: floorPlanId ?? null,
  })
  if (error) throw error
  if (!data) return []
  return (data as FloorPlanBundle[]).map((bundle) => ({
    ...bundle,
    layout_json: parseLayoutJson(bundle.layout_json),
  }))
}

export async function getPublicFloorPlanBundle(
  businessId: string,
): Promise<PublicFloorPlanBundle[]> {
  const { data, error } = await supabase.rpc('get_public_floor_plan_bundle', {
    p_business_id: businessId,
  })
  if (error) throw error
  if (!data) return []
  return (data as Array<Omit<PublicFloorPlanBundle, 'layout_json'> & { layout_json: unknown }>).map((bundle) => ({
    ...bundle,
    layout_json: parseLayoutJson(bundle.layout_json),
    resources_json: Array.isArray(bundle.resources_json) ? bundle.resources_json : [],
  }))
}

export async function upsertFloorPlan(
  businessId: string,
  name: string,
  layoutJson: LayoutJson,
  isActive = true,
  floorPlanId?: string,
): Promise<string> {
  const safeLayout = sanitizeLayoutJson(layoutJson)
  if (layoutJson.nodes.length > MAX_LAYOUT_NODES) {
    console.warn(`[floorPlan] layout_json troncato a ${MAX_LAYOUT_NODES} nodi`)
  }
  const { data, error } = await supabase.rpc('upsert_floor_plan', {
    p_business_id: businessId,
    p_floor_plan_id: floorPlanId ?? null,
    p_name: name.slice(0, 200),
    p_layout_json: safeLayout,
    p_is_active: isActive,
  })
  if (error) throw error
  return data as string
}

export async function upsertBookingResource(
  businessId: string,
  params: {
    resourceId?: string
    floorPlanId?: string | null
    kind?: ResourceKind
    label?: string
    capacityMin?: number
    capacityMax?: number
    positionJson?: Record<string, unknown>
    metadata?: Record<string, unknown>
    isActive?: boolean
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_booking_resource', {
    p_business_id: businessId,
    p_resource_id: params.resourceId ?? null,
    p_floor_plan_id: params.floorPlanId ?? null,
    p_kind: params.kind ?? 'table',
    p_label: params.label ?? null,
    p_capacity_min: params.capacityMin ?? 1,
    p_capacity_max: params.capacityMax ?? 4,
    p_position_json: params.positionJson ?? {},
    p_metadata: params.metadata ?? {},
    p_is_active: params.isActive ?? true,
  })
  if (error) throw error
  return data as string
}

export async function deleteBookingResource(resourceId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_booking_resource', {
    p_resource_id: resourceId,
  })
  if (error) throw error
}

export async function listAvailableResourcesForSlot(
  businessId: string,
  serviceId: string,
  startAt: string,
  endAt: string,
  partySize?: number,
): Promise<AvailableResource[]> {
  const { data, error } = await supabase.rpc('list_available_resources_for_slot', {
    p_business_id: businessId,
    p_service_id: serviceId,
    p_start_at: startAt,
    p_end_at: endAt,
    p_party_size: partySize ?? null,
  })
  if (error) throw error
  return (data as AvailableResource[]) ?? []
}

export async function assignTableToBooking(
  bookingId: string,
  resourceId: string,
  partySize?: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('assign_table_to_booking', {
    p_booking_id: bookingId,
    p_resource_id: resourceId,
    p_party_size: partySize ?? null,
  })
  if (error) throw error
}

export async function autoAssignResourceForBooking(
  bookingId: string,
  partySizeHint?: number | null,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('auto_assign_resource_for_booking', {
    p_booking_id: bookingId,
    p_party_size_hint: partySizeHint ?? null,
  })
  if (error) throw error
  return data as string | null
}

/** Eliminazione piano via RPC owner-only (`delete_floor_plan`). */
export async function deleteFloorPlan(businessId: string, floorPlanId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_floor_plan', {
    p_business_id: businessId,
    p_floor_plan_id: floorPlanId,
  })
  if (error) throw error
}

export async function aiSuggestResourceForBooking(
  businessId: string,
  bookingId: string,
  criteria?: Record<string, unknown>,
): Promise<AiSuggestedResource[]> {
  const { data, error } = await supabase.rpc('ai_suggest_resource_for_booking', {
    p_business_id: businessId,
    p_booking_id: bookingId,
    p_criteria: criteria ?? {},
  })
  if (error) throw error
  return (data as AiSuggestedResource[]) ?? []
}

export async function getResourceOccupancyAt(params: {
  businessId: string
  at: string
  floorPlanId?: string | null
}): Promise<OccupiedResourceAt[]> {
  const { data, error } = await supabase.rpc('get_resource_occupancy_at', {
    p_business_id: params.businessId,
    p_at: params.at,
    p_floor_plan_id: params.floorPlanId ?? null,
  })
  if (error) throw error
  return (data as OccupiedResourceAt[]) ?? []
}
