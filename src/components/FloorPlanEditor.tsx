import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LayoutJson, LayoutNode } from '@/lib/floorPlanApi'

interface Props {
  layoutJson: LayoutJson
  resources?: Array<{
    id: string
    is_active: boolean
    label: string
  }>
  backgroundUrl?: string | null
  occupiedResourceIds?: string[]
  /** Evidenzia la risorsa scelta (es. flusso prenotazione cliente). */
  focusedResourceId?: string | null
  onChange: (layout: LayoutJson) => void
  readOnly?: boolean
}

interface DragState {
  nodeId: string | null
  startX: number
  startY: number
  nodeStartX: number
  nodeStartY: number
  nodeStartWidth?: number
  nodeStartHeight?: number
  mode: 'move' | 'resize' | 'rotate' | null
  nodeStartRotation?: number
  rotateStartAngle?: number
  handle?: 'nw' | 'ne' | 'sw' | 'se'
}

const SHAPE_COLORS = {
  rect: '#3b82f6',
  circle: '#8b5cf6',
  booth: '#f59e0b',
}

const GRID_COLOR = 'rgba(255,255,255,0.08)'
const SELECTED_COLOR = '#22d3ee'
const FOCUSED_RESOURCE_COLOR = '#34d399'
const INACTIVE_COLOR = '#6b7280'
const OCCUPIED_COLOR = '#ef4444'

/** Dimensione minima normalizzata allineata a sanitize server/client (floorPlanApi). */
const MIN_NODE_DIM = 0.02

function nodePxMetrics(node: LayoutNode, cw: number, ch: number) {
  const nx = node.x * cw
  const ny = node.y * ch
  const nw = node.width * cw
  const nh = node.height * ch
  const cx = nx + nw / 2
  const cy = ny + nh / 2
  return { nx, ny, nw, nh, cx, cy }
}

/** Punto canvas → sistema locale centrato sul nodo, assi allineati al rettangolo prima della rotazione. */
function canvasToLocalFromCenter(px: number, py: number, cx: number, cy: number, rotationDeg: number) {
  const rad = (-rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = px - cx
  const dy = py - cy
  return { lx: dx * cos - dy * sin, ly: dx * sin + dy * cos }
}

function localOffsetToCanvas(cx: number, cy: number, lx: number, ly: number, rotationDeg: number) {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    wx: cx + lx * cos - ly * sin,
    wy: cy + lx * sin + ly * cos,
  }
}

function hitTestNodeBody(node: LayoutNode, px: number, py: number, cw: number, ch: number): boolean {
  const { nw, nh, cx, cy } = nodePxMetrics(node, cw, ch)
  const rot = node.rotation ?? 0
  const { lx, ly } = canvasToLocalFromCenter(px, py, cx, cy, rot)

  if (node.shape === 'circle') {
    const rx = nw / 2
    const ry = nh / 2
    if (rx <= 1e-6 || ry <= 1e-6) return false
    return (lx / rx) ** 2 + (ly / ry) ** 2 <= 1 + 1e-9
  }
  if (node.shape === 'booth') {
    const hw = nw / 2
    const hh = nh / 2
    if (Math.abs(lx) > hw + 1e-9 || Math.abs(ly) > hh + 1e-9) return false
    const r = Math.min(6, nw * 0.35, nh * 0.35)
    return pointInBoothTopRoundedLocal(lx, ly, hw, hh, r)
  }
  return Math.abs(lx) <= nw / 2 + 1e-9 && Math.abs(ly) <= nh / 2 + 1e-9
}

/** AABB normalizzato che avvolge il rettangolo ruotato (alert sovrapposizioni più fedele dell’AABB non ruotato). */
function normalizedRotatedAabb(node: LayoutNode, cw: number, ch: number) {
  const { nx, ny, nw, nh, cx, cy } = nodePxMetrics(node, cw, ch)
  const rotDeg = node.rotation ?? 0
  if (Math.abs(rotDeg) < 1e-6) {
    return { minX: node.x, maxX: node.x + node.width, minY: node.y, maxY: node.y + node.height }
  }
  const rot = rotDeg * (Math.PI / 180)
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const corners: Array<[number, number]> = [
    [nx - cx, ny - cy],
    [nx + nw - cx, ny - cy],
    [nx + nw - cx, ny + nh - cy],
    [nx - cx, ny + nh - cy],
  ]
  let minPx = Infinity
  let maxPx = -Infinity
  let minPy = Infinity
  let maxPy = -Infinity
  for (const [lx, ly] of corners) {
    const rx = lx * cos - ly * sin + cx
    const ry = lx * sin + ly * cos + cy
    minPx = Math.min(minPx, rx)
    maxPx = Math.max(maxPx, rx)
    minPy = Math.min(minPy, ry)
    maxPy = Math.max(maxPy, ry)
  }
  return { minX: minPx / cw, maxX: maxPx / cw, minY: minPy / ch, maxY: maxPy / ch }
}

function normalizedAabbOverlap(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
}

/** Booth draw: roundRect(..., [r,r,0,0]) — solo angoli alto sinistra/destra (spazio locale centrato, px). */
function pointInBoothTopRoundedLocal(lx: number, ly: number, hw: number, hh: number, r: number): boolean {
  const rr = Math.max(0, Math.min(r, hw, hh))
  if (rr < 1e-9) return true
  const tlCx = -hw + rr
  const tlCy = -hh + rr
  if (lx <= tlCx && ly <= tlCy) {
    return (lx - tlCx) ** 2 + (ly - tlCy) ** 2 <= rr * rr + 1e-9
  }
  const trCx = hw - rr
  const trCy = -hh + rr
  if (lx >= trCx && ly <= trCy) {
    return (lx - trCx) ** 2 + (ly - trCy) ** 2 <= rr * rr + 1e-9
  }
  return true
}

type FootprintVec2 = { x: number; y: number }

/** Vertici OBB in coordinate normalizzate [0,1], coerenti con ctx.rotate sul bounding box. */
function obbFootprintNormalized(node: LayoutNode): FootprintVec2[] {
  const cx = node.x + node.width / 2
  const cy = node.y + node.height / 2
  const hw = node.width / 2
  const hh = node.height / 2
  const θ = ((node.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(θ)
  const sin = Math.sin(θ)
  const locals: FootprintVec2[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ]
  return locals.map(({ x: lx, y: ly }) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  }))
}

/** Profilo booth coerente con `ctx.roundRect(..., [r,r,0,0])`: CCW in px dal centro, poi ruotato come gli altri nodi. */
function boothFootprintNormalized(node: LayoutNode, cw: number, ch: number): FootprintVec2[] {
  const nwPx = node.width * cw
  const nhPx = node.height * ch
  const hwPx = nwPx / 2
  const hhPx = nhPx / 2
  const rPx = Math.min(6, nwPx * 0.35, nhPx * 0.35)

  const localsNorm: FootprintVec2[] = []
  const pushPx = (vx: number, vy: number) => {
    localsNorm.push({ x: vx / cw, y: vy / ch })
  }

  pushPx(-hwPx, hhPx)
  pushPx(hwPx, hhPx)
  pushPx(hwPx, -hhPx + rPx)

  const cxTr = hwPx - rPx
  const cyTr = -hhPx + rPx
  const arcSeg = 12
  for (let i = 1; i < arcSeg; i++) {
    const t = i / arcSeg
    const ang = (-Math.PI / 2) + t * (Math.PI / 2)
    pushPx(cxTr + rPx * Math.cos(ang), cyTr + rPx * Math.sin(ang))
  }

  pushPx(hwPx - rPx, -hhPx)
  pushPx(-hwPx + rPx, -hhPx)

  const cxTl = -hwPx + rPx
  const cyTl = -hhPx + rPx
  for (let i = 1; i < arcSeg; i++) {
    const t = i / arcSeg
    const ang = Math.PI + t * (Math.PI / 2)
    pushPx(cxTl + rPx * Math.cos(ang), cyTl + rPx * Math.sin(ang))
  }

  pushPx(-hwPx, -hhPx + rPx)

  const cx = node.x + node.width / 2
  const cy = node.y + node.height / 2
  const θ = ((node.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(θ)
  const sin = Math.sin(θ)
  return localsNorm.map(({ x: lx, y: ly }) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  }))
}

/** Approssima ellisse ruotata per SAT (abbastanza segmenti per overlap stabile). */
function ellipseFootprintNormalized(node: LayoutNode, segments: number): FootprintVec2[] {
  const cx = node.x + node.width / 2
  const cy = node.y + node.height / 2
  const rx = node.width / 2
  const ry = node.height / 2
  const θ = ((node.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(θ)
  const sin = Math.sin(θ)
  const out: FootprintVec2[] = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const lx = rx * Math.cos(t)
    const ly = ry * Math.sin(t)
    out.push({
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos,
    })
  }
  return out
}

function nodeFootprintPolygon(node: LayoutNode, cw: number, ch: number): FootprintVec2[] {
  if (node.shape === 'circle') return ellipseFootprintNormalized(node, 36)
  if (node.shape === 'booth') return boothFootprintNormalized(node, cw, ch)
  return obbFootprintNormalized(node)
}

function dedupeAxes(axes: FootprintVec2[]): FootprintVec2[] {
  const seen = new Set<string>()
  const out: FootprintVec2[] = []
  for (const ax of axes) {
    const len = Math.hypot(ax.x, ax.y)
    if (len < 1e-14) continue
    let nx = ax.x / len
    let ny = ax.y / len
    if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && ny < 0)) {
      nx = -nx
      ny = -ny
    }
    const key = `${nx.toFixed(5)},${ny.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ x: nx, y: ny })
  }
  return out
}

function polygonEdgeNormals(poly: FootprintVec2[]): FootprintVec2[] {
  const axes: FootprintVec2[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const p1 = poly[i]
    const p2 = poly[(i + 1) % n]
    if (!p1 || !p2) continue
    const ex = p2.x - p1.x
    const ey = p2.y - p1.y
    const len = Math.hypot(ex, ey)
    if (len < 1e-14) continue
    axes.push({ x: -ey / len, y: ex / len })
  }
  return axes
}

function projectOntoAxis(poly: FootprintVec2[], axis: FootprintVec2): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const p of poly) {
    const s = p.x * axis.x + p.y * axis.y
    min = Math.min(min, s)
    max = Math.max(max, s)
  }
  return { min, max }
}

/** SAT su due poligoni convessi (stesso piano normalizzato). Assi deduplicati per efficienza. */
function satConvexOverlap(a: FootprintVec2[], b: FootprintVec2[]): boolean {
  if (a.length < 3 || b.length < 3) return false
  const axes = dedupeAxes([...polygonEdgeNormals(a), ...polygonEdgeNormals(b)])
  for (const axis of axes) {
    const pa = projectOntoAxis(a, axis)
    const pb = projectOntoAxis(b, axis)
    if (pa.max < pb.min - 1e-11 || pb.max < pa.min - 1e-11) return false
  }
  return true
}

export default function FloorPlanEditor({
  layoutJson,
  resources = [],
  backgroundUrl,
  occupiedResourceIds = [],
  focusedResourceId = null,
  onChange,
  readOnly = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [drag, setDrag] = useState<DragState>({
    nodeId: null,
    startX: 0,
    startY: 0,
    nodeStartX: 0,
    nodeStartY: 0,
    mode: null,
  })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)

  const { width_px: cw, height_px: ch } = layoutJson.bounds
  const cols = layoutJson.grid?.columns ?? 10
  const rows = layoutJson.grid?.rows ?? 8
  const gridStepX = cols > 0 ? 1 / cols : 0.1
  const gridStepY = rows > 0 ? 1 / rows : 0.1

  const snapX = useCallback(
    (v: number) => (snapToGrid ? Math.round(v / gridStepX) * gridStepX : v),
    [snapToGrid, gridStepX],
  )
  const snapY = useCallback(
    (v: number) => (snapToGrid ? Math.round(v / gridStepY) * gridStepY : v),
    [snapToGrid, gridStepY],
  )

  const overlaps = useMemo(() => {
    const ids = new Set<string>()
    const nodes = layoutJson.nodes
    const boxes = nodes.map((n) => normalizedRotatedAabb(n, cw, ch))
    const polys = nodes.map((n) => nodeFootprintPolygon(n, cw, ch))
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      const ab = boxes[i]
      const pa = polys[i]
      if (!a || !ab || !pa?.length) continue
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        const bb = boxes[j]
        const pb = polys[j]
        if (!b || !bb || !pb?.length) continue
        if (!normalizedAabbOverlap(ab, bb)) continue
        if (satConvexOverlap(pa, pb)) {
          ids.add(a.id)
          ids.add(b.id)
        }
      }
    }
    return ids
  }, [layoutJson.nodes, cw, ch])

  const scheduleSave = useCallback(
    (newLayout: LayoutJson) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        onChange(newLayout)
      }, 2000)
    },
    [onChange],
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let alive = true
    if (!backgroundUrl) {
      setBgImage(null)
      return () => {
        alive = false
      }
    }
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (!alive) return
      setBgImage(img)
    }
    img.onerror = () => {
      if (!alive) return
      setBgImage(null)
    }
    img.src = backgroundUrl
    return () => {
      alive = false
      img.onload = null
      img.onerror = null
      img.src = ''
    }
  }, [backgroundUrl])

  const nodeAt = useCallback(
    (px: number, py: number): LayoutNode | null => {
      const reversed = [...layoutJson.nodes].reverse()
      for (const node of reversed) {
        if (hitTestNodeBody(node, px, py, cw, ch)) return node
      }
      return null
    },
    [layoutJson.nodes, cw, ch],
  )

  const getCursor = useCallback(
    (px: number, py: number) => {
      if (isPanning) return 'grabbing'
      if (readOnly) return 'default'
      const edge = 8 / zoom
      if (selectedNodeId && !readOnly) {
        const sel = layoutJson.nodes.find((n) => n.id === selectedNodeId)
        if (sel) {
          const { nw, nh, cx, cy } = nodePxMetrics(sel, cw, ch)
          const rot = sel.rotation ?? 0
          const nw2 = nw / 2
          const nh2 = nh / 2
          const corners: Array<{ lx: number; ly: number; cursor: string }> = [
            { lx: -nw2, ly: -nh2, cursor: 'nwse-resize' },
            { lx: nw2, ly: -nh2, cursor: 'nesw-resize' },
            { lx: -nw2, ly: nh2, cursor: 'nesw-resize' },
            { lx: nw2, ly: nh2, cursor: 'nwse-resize' },
          ]
          for (const c of corners) {
            const { wx, wy } = localOffsetToCanvas(cx, cy, c.lx, c.ly, rot)
            if (Math.hypot(px - wx, py - wy) < edge) return c.cursor as string
          }
          const rotHy = -nh / 2 - 18 / zoom
          const rh = localOffsetToCanvas(cx, cy, 0, rotHy, rot)
          if (Math.hypot(px - rh.wx, py - rh.wy) < edge) return 'grab'
        }
      }
      const node = nodeAt(px, py)
      if (node) return 'move'
      return 'crosshair'
    },
    [layoutJson.nodes, selectedNodeId, nodeAt, cw, ch, zoom, isPanning, readOnly],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = cw * dpr * zoom
    canvas.height = ch * dpr * zoom
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0)

    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, cw, ch)

    if (bgImage) {
      const opacity = typeof layoutJson.background?.opacity === 'number' ? layoutJson.background.opacity : 0.9
      const fit = layoutJson.background?.fit ?? 'contain'
      const iw = bgImage.naturalWidth || bgImage.width
      const ih = bgImage.naturalHeight || bgImage.height
      if (iw > 0 && ih > 0) {
        const scale =
          fit === 'cover'
            ? Math.max(cw / iw, ch / ih)
            : Math.min(cw / iw, ch / ih)
        const dw = iw * scale
        const dh = ih * scale
        const dx = (cw - dw) / 2
        const dy = (ch - dh) / 2
        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
        ctx.drawImage(bgImage, dx, dy, dw, dh)
        ctx.restore()
      }
    }

    if (showGrid) {
      ctx.strokeStyle = GRID_COLOR
      ctx.lineWidth = 0.5
      for (let i = 0; i <= cols; i++) {
        const x = (i / cols) * cw
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, ch)
        ctx.stroke()
      }
      for (let j = 0; j <= rows; j++) {
        const y = (j / rows) * ch
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(cw, y)
        ctx.stroke()
      }
    }

    for (const node of layoutJson.nodes) {
      const nx = node.x * cw
      const ny = node.y * ch
      const nw = node.width * cw
      const nh = node.height * ch
      const isSelected = node.id === selectedNodeId
      const isHovered = node.id === hoveredNodeId
      const isOverlapping = overlaps.has(node.id)

      ctx.save()
      if (node.rotation) {
        const cx = nx + nw / 2
        const cy = ny + nh / 2
        ctx.translate(cx, cy)
        ctx.rotate((node.rotation * Math.PI) / 180)
        ctx.translate(-cx, -cy)
      }

      const isResourceActive = resources.find((r) => r.id === node.resource_id)?.is_active ?? true
      const isOccupied = occupiedResourceIds.includes(node.resource_id)
      const isFocusedPref = Boolean(focusedResourceId && node.resource_id === focusedResourceId)
      const fillColor =
        isResourceActive === false ? INACTIVE_COLOR : isOccupied ? OCCUPIED_COLOR : (SHAPE_COLORS[node.shape] ?? SHAPE_COLORS.rect)
      ctx.fillStyle = fillColor
      ctx.strokeStyle = isOverlapping
        ? '#ef4444'
        : isFocusedPref
          ? FOCUSED_RESOURCE_COLOR
          : isSelected
            ? SELECTED_COLOR
            : isHovered
              ? SELECTED_COLOR
              : isOccupied
                ? '#fecaca'
                : 'rgba(255,255,255,0.3)'
      ctx.lineWidth = isFocusedPref ? 3 : isSelected || isHovered ? 2 : 1

      if (node.shape === 'circle') {
        ctx.beginPath()
        ctx.ellipse(nx + nw / 2, ny + nh / 2, nw / 2, nh / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else if (node.shape === 'booth') {
        const r = 6
        ctx.beginPath()
        ctx.roundRect(nx, ny, nw, nh, [r, r, 0, 0])
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.roundRect(nx, ny, nw, nh, 4)
        ctx.fill()
        ctx.stroke()
      }

      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(10, Math.min(nw, nh) * 0.35)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const fallback = node.type === 'station' ? 'P' : node.type === 'seat' ? 'S' : 'T'
      const label = node.label || fallback
      ctx.fillText(label, nx + nw / 2, ny + nh / 2)

      if (node.zone && node.zone !== 'default') {
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = `${Math.max(8, Math.min(nw, nh) * 0.22)}px sans-serif`
        ctx.fillText(node.zone, nx + nw / 2, ny + nh / 2 + Math.max(8, Math.min(nw, nh) * 0.2))
      }

      if (isSelected && !readOnly) {
        const handles = [
          { x: nx, y: ny, cursor: 'nwse-resize', id: 'nw' },
          { x: nx + nw, y: ny, cursor: 'nesw-resize', id: 'ne' },
          { x: nx, y: ny + nh, cursor: 'nesw-resize', id: 'sw' },
          { x: nx + nw, y: ny + nh, cursor: 'nwse-resize', id: 'se' },
        ]
        ctx.fillStyle = SELECTED_COLOR
        for (const h of handles) {
          ctx.beginPath()
          ctx.arc(h.x, h.y, 4 / zoom, 0, Math.PI * 2)
          ctx.fill()
        }

        const rx = nx + nw / 2
        const ry = ny - 18 / zoom
        ctx.strokeStyle = SELECTED_COLOR
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(nx + nw / 2, ny)
        ctx.lineTo(rx, ry)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(rx, ry, 5 / zoom, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    }

    if (selectedNodeId) {
      const selNode = layoutJson.nodes.find((n) => n.id === selectedNodeId)
      if (selNode) {
        ctx.fillStyle = 'rgba(34,211,238,0.05)'
        ctx.strokeStyle = SELECTED_COLOR
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.strokeRect(-8, -8, cw + 16, ch + 16)
        ctx.setLineDash([])
      }
    }
  }, [layoutJson, cw, ch, selectedNodeId, hoveredNodeId, showGrid, zoom, readOnly, resources, cols, rows, overlaps, bgImage, occupiedResourceIds, focusedResourceId])

  useEffect(() => {
    draw()
  }, [draw])

  const screenToCanvas = useCallback(
    (sx: number, sy: number) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (sx - rect.left) / zoom,
        y: (sy - rect.top) / zoom,
      }
    },
    [zoom],
  )

  const getHandleAt = useCallback(
    (px: number, py: number): { nodeId: string; handle: 'nw' | 'ne' | 'sw' | 'se' } | null => {
      const edge = 8 / zoom
      for (const node of layoutJson.nodes) {
        if (node.id !== selectedNodeId) continue
        const { nw, nh, cx, cy } = nodePxMetrics(node, cw, ch)
        const rot = node.rotation ?? 0
        const nw2 = nw / 2
        const nh2 = nh / 2
        const corners: Array<{ lx: number; ly: number; id: 'nw' | 'ne' | 'sw' | 'se' }> = [
          { lx: -nw2, ly: -nh2, id: 'nw' },
          { lx: nw2, ly: -nh2, id: 'ne' },
          { lx: -nw2, ly: nh2, id: 'sw' },
          { lx: nw2, ly: nh2, id: 'se' },
        ]
        for (const h of corners) {
          const { wx, wy } = localOffsetToCanvas(cx, cy, h.lx, h.ly, rot)
          if (Math.hypot(px - wx, py - wy) < edge) {
            return { nodeId: node.id, handle: h.id }
          }
        }
      }
      return null
    },
    [layoutJson.nodes, selectedNodeId, cw, ch, zoom],
  )

  const getRotateHandleAt = useCallback(
    (px: number, py: number): { nodeId: string } | null => {
      if (!selectedNodeId) return null
      const node = layoutJson.nodes.find((n) => n.id === selectedNodeId)
      if (!node) return null
      const { nh, cx, cy } = nodePxMetrics(node, cw, ch)
      const rot = node.rotation ?? 0
      const rotHy = -nh / 2 - 18 / zoom
      const r = localOffsetToCanvas(cx, cy, 0, rotHy, rot)
      const hitR = 8 / zoom
      if ((px - r.wx) ** 2 + (py - r.wy) ** 2 <= hitR * hitR) return { nodeId: node.id }
      return null
    },
    [layoutJson.nodes, selectedNodeId, cw, ch, zoom],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return
      const { x, y } = screenToCanvas(e.clientX, e.clientY)
      const rotateInfo = getRotateHandleAt(x, y)
      if (rotateInfo) {
        const node = layoutJson.nodes.find((n) => n.id === rotateInfo.nodeId)
        if (!node) return
        const cx = (node.x + node.width / 2) * cw
        const cy = (node.y + node.height / 2) * ch
        const startAngle = Math.atan2(y - cy, x - cx)
        setDrag({
          nodeId: node.id,
          startX: x,
          startY: y,
          nodeStartX: node.x,
          nodeStartY: node.y,
          nodeStartRotation: node.rotation ?? 0,
          rotateStartAngle: startAngle,
          mode: 'rotate',
        })
        return
      }
      const handleInfo = getHandleAt(x, y)
      if (handleInfo) {
        const node = layoutJson.nodes.find((n) => n.id === handleInfo.nodeId)
        if (!node) return
        setDrag({
          nodeId: handleInfo.nodeId,
          startX: x,
          startY: y,
          nodeStartX: node.x,
          nodeStartY: node.y,
          nodeStartWidth: node.width,
          nodeStartHeight: node.height,
          mode: 'resize',
          handle: handleInfo.handle,
        })
        return
      }
      const node = nodeAt(x, y)
      if (node) {
        setSelectedNodeId(node.id)
        setDrag({
          nodeId: node.id,
          startX: x,
          startY: y,
          nodeStartX: node.x,
          nodeStartY: node.y,
          mode: 'move',
        })
      } else {
        setSelectedNodeId(null)
        setDrag({ nodeId: null, startX: 0, startY: 0, nodeStartX: 0, nodeStartY: 0, mode: null })
      }
    },
    [readOnly, screenToCanvas, getRotateHandleAt, layoutJson.nodes, cw, ch, getHandleAt, nodeAt],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = screenToCanvas(e.clientX, e.clientY)
      if (isPanning) {
        setPan({ x: e.clientX - panStart.x + panStart.panX, y: e.clientY - panStart.y + panStart.panY })
        return
      }
      if (drag.mode === 'rotate' && drag.nodeId && typeof drag.nodeStartRotation === 'number' && typeof drag.rotateStartAngle === 'number') {
        const node = layoutJson.nodes.find((n) => n.id === drag.nodeId)
        if (!node) return
        const cx = (node.x + node.width / 2) * cw
        const cy = (node.y + node.height / 2) * ch
        const ang = Math.atan2(y - cy, x - cx)
        const delta = ang - drag.rotateStartAngle
        const deg = (drag.nodeStartRotation + (delta * 180) / Math.PI + 360) % 360
        const snapped = snapToGrid ? Math.round(deg / 5) * 5 : deg
        const newLayout = {
          ...layoutJson,
          nodes: layoutJson.nodes.map((n) => (n.id === drag.nodeId ? { ...n, rotation: snapped } : n)),
        }
        scheduleSave(newLayout)
        return
      }
      if (drag.mode === 'move' && drag.nodeId) {
        const dx = (x - drag.startX) / cw
        const dy = (y - drag.startY) / ch
        const newLayout = {
          ...layoutJson,
          nodes: layoutJson.nodes.map((n) =>
            n.id === drag.nodeId ? { ...n, x: Math.max(0, Math.min(1 - n.width, snapX(drag.nodeStartX + dx))), y: Math.max(0, Math.min(1 - n.height, snapY(drag.nodeStartY + dy))) } : n,
          ),
        }
        scheduleSave(newLayout)
        return
      }
      if (drag.mode === 'resize' && drag.nodeId && drag.handle) {
        const node = layoutJson.nodes.find((n) => n.id === drag.nodeId)
        if (!node) return
        const sx = drag.nodeStartX
        const sy = drag.nodeStartY
        const sw = drag.nodeStartWidth ?? node.width
        const sh = drag.nodeStartHeight ?? node.height
        const dx_px = x - drag.startX
        const dy_px = y - drag.startY
        const θ = ((node.rotation ?? 0) * Math.PI) / 180
        const cos = Math.cos(-θ)
        const sin = Math.sin(-θ)
        const ldx = (dx_px * cos - dy_px * sin) / cw
        const ldy = (dx_px * sin + dy_px * cos) / ch

        let newW = sw
        let newH = sh
        let newX = sx
        let newY = sy

        if (drag.handle === 'se') {
          newW = snapX(sw + ldx)
          newH = snapY(sh + ldy)
          newX = sx
          newY = sy
        } else if (drag.handle === 'nw') {
          newW = snapX(sw - ldx)
          newH = snapY(sh - ldy)
          newX = sx + sw - newW
          newY = sy + sh - newH
        } else if (drag.handle === 'ne') {
          newW = snapX(sw + ldx)
          newH = snapY(sh - ldy)
          newX = sx
          newY = sy + sh - newH
        } else if (drag.handle === 'sw') {
          newW = snapX(sw - ldx)
          newH = snapY(sh + ldy)
          newX = sx + sw - newW
          newY = sy
        }

        newW = Math.max(MIN_NODE_DIM, Math.min(1 - newX, newW))
        newH = Math.max(MIN_NODE_DIM, Math.min(1 - newY, newH))
        newX = Math.max(0, Math.min(1 - newW, newX))
        newY = Math.max(0, Math.min(1 - newH, newY))
        newW = Math.max(MIN_NODE_DIM, Math.min(1 - newX, newW))
        newH = Math.max(MIN_NODE_DIM, Math.min(1 - newY, newH))

        const newLayout = {
          ...layoutJson,
          nodes: layoutJson.nodes.map((n) =>
            n.id === drag.nodeId ? { ...n, x: newX, y: newY, width: newW, height: newH } : n,
          ),
        }
        scheduleSave(newLayout)
        return
      }
      if (!drag.nodeId) {
        setHoveredNodeId(nodeAt(x, y)?.id ?? null)
      }
    },
    [screenToCanvas, isPanning, panStart, drag, layoutJson, cw, ch, nodeAt, scheduleSave, snapX, snapY, snapToGrid],
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    if ((drag.mode === 'move' || drag.mode === 'resize') && drag.nodeId) {
      onChange(layoutJson)
    }
    if (drag.mode === 'rotate' && drag.nodeId) {
      onChange(layoutJson)
    }
    setDrag({ nodeId: null, startX: 0, startY: 0, nodeStartX: 0, nodeStartY: 0, mode: null })
  }, [drag, layoutJson, onChange])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
    },
    [],
  )

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsPanning(true)
        setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y })
        return
      }
      handleMouseDown(e)
    },
    [pan, handleMouseDown],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (readOnly) return
      if (e.key === 'Escape') {
        setSelectedNodeId(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault()
        const newLayout = {
          ...layoutJson,
          nodes: layoutJson.nodes.filter((n) => n.id !== selectedNodeId),
        }
        onChange(newLayout)
        setSelectedNodeId(null)
        return
      }
      if (
        selectedNodeId &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')
      ) {
        e.preventDefault()
        const stepX = e.shiftKey ? gridStepX / 4 : gridStepX
        const stepY = e.shiftKey ? gridStepY / 4 : gridStepY
        const dx =
          e.key === 'ArrowLeft' ? -stepX : e.key === 'ArrowRight' ? stepX : 0
        const dy = e.key === 'ArrowUp' ? -stepY : e.key === 'ArrowDown' ? stepY : 0
        const newLayout = {
          ...layoutJson,
          nodes: layoutJson.nodes.map((n) => {
            if (n.id !== selectedNodeId) return n
            const nx = Math.max(0, Math.min(1 - n.width, snapX(n.x + dx)))
            const ny = Math.max(0, Math.min(1 - n.height, snapY(n.y + dy)))
            return { ...n, x: nx, y: ny }
          }),
        }
        onChange(newLayout)
      }
    },
    [selectedNodeId, layoutJson, onChange, readOnly, gridStepX, gridStepY, snapX, snapY],
  )

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowGrid((g) => !g)}
          className={`rounded px-2 py-1 text-xs ${showGrid ? 'bg-cyan-900 text-cyan-300' : 'bg-white/10 text-white/60'}`}
        >
          Griglia
        </button>
        <button
          onClick={() => setSnapToGrid((s) => !s)}
          className={`rounded px-2 py-1 text-xs ${snapToGrid ? 'bg-cyan-900 text-cyan-300' : 'bg-white/10 text-white/60'}`}
        >
          Snap
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
          className="rounded bg-white/10 px-2 py-1 text-xs text-white"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
          className="rounded bg-white/10 px-2 py-1 text-xs text-white"
        >
          −
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          className="rounded bg-white/10 px-2 py-1 text-xs text-white"
        >
          Reset
        </button>
        <button
          onClick={() => {
            const canvas = canvasRef.current
            if (!canvas) return
            const url = canvas.toDataURL('image/png')
            const a = document.createElement('a')
            a.href = url
            a.download = 'planimetria.png'
            a.click()
          }}
          className="rounded bg-white/10 px-2 py-1 text-xs text-white"
        >
          Export PNG
        </button>
        <span className="ml-auto text-xs text-white/40">{Math.round(zoom * 100)}%</span>
      </div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded border border-white/10"
        style={{ height: Math.min(500, ch * zoom) + 40, width: '100%' }}
      >
        <div className="absolute inset-0 overflow-auto">
          <canvas
            ref={canvasRef}
            style={{
              width: cw * zoom,
              height: ch * zoom,
              cursor: 'crosshair',
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={(e) => {
              const cursor = getCursor(
                (e.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0)) / zoom,
                (e.clientY - (canvasRef.current?.getBoundingClientRect().top ?? 0)) / zoom,
              )
              if (canvasRef.current) canvasRef.current.style.cursor = cursor
              handleMouseMove(e)
            }}
            onWheel={handleWheel}
            tabIndex={0}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
      {selectedNodeId && !readOnly && (
        <div className="flex gap-2 text-xs text-white/60">
          <span>
            Drag per spostare · Handle per ridimensionare · Handle sopra per ruotare · Frecce per spostare (Shift = passo fine) · Esc deseleziona · Alt+drag o tasto centrale
            per pan · Del elimina
          </span>
        </div>
      )}
    </div>
  )
}
