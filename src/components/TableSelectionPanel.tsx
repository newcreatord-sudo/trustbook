import { useCallback, useEffect, useRef, useState } from 'react'
import type { AvailableResource } from '@/lib/floorPlanApi'
import { listAvailableResourcesForSlot } from '@/lib/floorPlanApi'
import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'

interface Props {
  businessId: string
  serviceId: string
  startAt: string
  endAt: string
  partySize: number
  customerTableChoice: 'off' | 'preferred' | 'required'
  onSelect: (resourceId: string) => void
  onSkip: () => void
  isLoading?: boolean
}

export default function TableSelectionPanel({
  businessId,
  serviceId,
  startAt,
  endAt,
  partySize,
  customerTableChoice,
  onSelect,
  onSkip,
  isLoading: externalLoading,
}: Props) {
  const [resources, setResources] = useState<AvailableResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const loadResources = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listAvailableResourcesForSlot(businessId, serviceId, startAt, endAt, partySize)
      setResources(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tables')
    } finally {
      setLoading(false)
    }
  }, [businessId, serviceId, startAt, endAt, partySize])

  useEffect(() => {
    if (customerTableChoice !== 'off') {
      loadResources()
    }
  }, [customerTableChoice, loadResources])

  useEffect(() => {
    if (resources.length === 0 || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, W, H)

    const cols = 8
    const rows = Math.ceil(resources.length / cols)
    const cellW = W / cols
    const cellH = H / Math.max(rows, 3)
    const pad = 8

    resources.forEach((res, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = col * cellW + pad
      const y = row * cellH + pad
      const w = cellW - pad * 2
      const h = cellH - pad * 2 - 20
      const isSelected = res.resource_id === selectedId

      ctx.fillStyle = isSelected ? '#22d3ee' : '#3b82f6'
      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.3)'
      ctx.lineWidth = isSelected ? 2 : 1

      ctx.beginPath()
      ctx.roundRect(x, y, w, Math.max(h, 30), 4)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(res.label, x + w / 2, y + Math.max(h, 30) / 2 - 6)

      ctx.font = '9px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText(`${res.capacity_min}–${res.capacity_max} pax`, x + w / 2, y + Math.max(h, 30) / 2 + 8)

      if (res.zone && res.zone !== 'default') {
        ctx.font = '8px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText(res.zone, x + w / 2, y + Math.max(h, 30) + 8)
      }
    })
  }, [resources, selectedId])

  if (customerTableChoice === 'off') return null

  if (loading || externalLoading) {
    return (
      <Card className="p-4">
        <p className="text-sm text-white/60">Caricamento tavoli disponibili...</p>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-4">
        <p className="text-sm text-red-400">Errore: {error}</p>
        {customerTableChoice === 'preferred' && (
          <Button variant="secondary" size="sm" className="mt-2" onClick={onSkip}>
            Assegnazione automatica
          </Button>
        )}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Scegli il tuo tavolo</h3>
          <p className="text-xs text-white/50">
            {resources.length === 0
              ? 'Nessun tavolo disponibile per questa fascia'
              : `${resources.length} tavolo/i disponibile/i`}
          </p>
        </div>
        {resources.length > 0 && selectedId && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSelect(selectedId)}
          >
            Conferma tavolo
          </Button>
        )}
      </div>

      {resources.length === 0 ? (
        <Card className="p-4 text-center">
          <p className="text-sm text-white/60">
            {customerTableChoice === 'required'
              ? 'Nessun tavolo disponibile per questa fascia. Riprova con un altro orario.'
              : 'Nessun tavolo disponibile per questa fascia.'}
          </p>
          {customerTableChoice === 'preferred' && (
            <Button variant="secondary" size="sm" className="mt-2" onClick={onSkip}>
              Assegnazione automatica
            </Button>
          )}
        </Card>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={600}
            height={Math.max(120, Math.ceil(resources.length / 8) * 70)}
            className="w-full cursor-pointer rounded"
            onClick={(e) => {
              const rect = canvasRef.current?.getBoundingClientRect()
              if (!rect) return
              const col = Math.floor(((e.clientX - rect.left) / rect.width) * 8)
              const row = Math.floor(((e.clientY - rect.top) / rect.height) * Math.ceil(resources.length / 8))
              const idx = row * 8 + col
              if (idx >= 0 && idx < resources.length) {
                setSelectedId(resources[idx].resource_id)
              }
            }}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {resources.map((res) => (
              <button
                key={res.resource_id}
                onClick={() => setSelectedId(res.resource_id)}
                className={`flex items-center justify-between rounded border p-2 text-left transition-colors ${
                  selectedId === res.resource_id
                    ? 'border-cyan-500 bg-cyan-950/30'
                    : 'border-white/10 bg-white/5 hover:border-white/30'
                }`}
              >
                <div>
                  <span className="text-sm font-medium text-white">{res.label}</span>
                  <span className="ml-2 text-xs text-white/40">
                    {res.capacity_min}–{res.capacity_max} pax
                  </span>
                </div>
                {res.zone && res.zone !== 'default' && (
                  <span className="text-xs text-white/40">{res.zone}</span>
                )}
              </button>
            ))}
          </div>
          {customerTableChoice === 'preferred' && (
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={onSkip}>
                Assegnazione automatica
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
