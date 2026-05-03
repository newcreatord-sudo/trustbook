import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { FloorPlanBundle, LayoutJson, LayoutNode, ResourceKind } from '@/lib/floorPlanApi'
import {
  deleteBookingResource,
  deleteFloorPlan,
  getFloorPlanBundle,
  getResourceOccupancyAt,
  upsertBookingResource,
  upsertFloorPlan,
} from '@/lib/floorPlanApi'
import FloorPlanEditor from './FloorPlanEditor'
import Button from '@/shared/ui/Button'
import Input from '@/shared/ui/Input'
import Alert from '@/shared/ui/Alert'
import Card from '@/shared/ui/Card'
import Modal from '@/shared/ui/Modal'
import type { BusinessBookingEcosystemRow } from '@/lib/businessEcosystem'
import { createBusinessPrivateSignedUrl, uploadBusinessPrivateMedia } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

interface Props {
  businessId: string
  ecosystem: BusinessBookingEcosystemRow | null
}

type Tab = 'plans' | 'editor' | 'resources'

const DEFAULT_LAYOUT: LayoutJson = {
  version: 1,
  bounds: { width_px: 800, height_px: 600 },
  background: null,
  nodes: [],
  walls: [],
  annotations: [],
}

function makeNodeId() {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const LAYOUT_SAVE_DEBOUNCE_MS = 450

export default function FloorPlanManager({ businessId, ecosystem }: Props) {
  const [bundles, setBundles] = useState<FloorPlanBundle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('plans')
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [newPlanName, setNewPlanName] = useState('')
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [currentLayout, setCurrentLayout] = useState<LayoutJson>(DEFAULT_LAYOUT)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showResourceModal, setShowResourceModal] = useState(false)
  const [editResourceId, setEditResourceId] = useState<string | null>(null)
  const [resLabel, setResLabel] = useState('')
  const [resKind, setResKind] = useState<ResourceKind>('table')
  const [resCapMin, setResCapMin] = useState('1')
  const [resCapMax, setResCapMax] = useState('4')
  const [resZone, setResZone] = useState('')
  const [resActive, setResActive] = useState(true)
  const [savingResource, setSavingResource] = useState(false)
  const [resMetadata, setResMetadata] = useState<Record<string, unknown>>({})
  const [resPhoto, setResPhoto] = useState<{ bucket: 'business-private'; path: string } | null>(null)
  const [resPhotoUrl, setResPhotoUrl] = useState<string | null>(null)
  const [resPhotoBusy, setResPhotoBusy] = useState(false)
  const [resourceAddKind, setResourceAddKind] = useState<ResourceKind>('table')
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [bgBusy, setBgBusy] = useState(false)
  const [occupiedResourceIds, setOccupiedResourceIds] = useState<string[]>([])
  const [occupancyBusy, setOccupancyBusy] = useState(false)
  const [atIso, setAtIso] = useState<string>(() => new Date().toISOString())

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingLayoutRef = useRef<LayoutJson | null>(null)
  const floorPlanCtxRef = useRef<{ id: string | null; name: string }>({ id: null, name: 'Piano' })

  const selectedBundle = bundles.find((b) => b.floor_plan_id === selectedPlanId) ?? null

  useEffect(() => {
    floorPlanCtxRef.current = {
      id: selectedPlanId,
      name: selectedBundle?.floor_plan_name ?? 'Piano',
    }
  }, [selectedPlanId, selectedBundle?.floor_plan_name])

  const primaryKind: ResourceKind = useMemo(() => {
    const raw = ecosystem?.settings?.resource_primary_kind
    if (raw === 'table' || raw === 'station' || raw === 'seat') return raw
    if (ecosystem?.booking_vertical === 'professional_slot') return 'station'
    if (ecosystem?.booking_vertical === 'seat_assignment') return 'seat'
    return 'table'
  }, [ecosystem?.booking_vertical, ecosystem?.settings])

  useEffect(() => {
    setResourceAddKind(primaryKind)
  }, [primaryKind])

  const loadBundles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getFloorPlanBundle(businessId)
      setBundles(data)
      if (data.length > 0 && !selectedPlanId) {
        setSelectedPlanId(data[0].floor_plan_id)
        setCurrentLayout(data[0].layout_json)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load floor plans')
    } finally {
      setLoading(false)
    }
  }, [businessId, selectedPlanId])

  const refreshOccupancy = useCallback(async () => {
    if (!selectedPlanId) {
      setOccupiedResourceIds([])
      return
    }
    setOccupancyBusy(true)
    try {
      const nowIso = new Date().toISOString()
      setAtIso(nowIso)
      const rows = await getResourceOccupancyAt({ businessId, at: nowIso, floorPlanId: selectedPlanId })
      const ids = Array.from(new Set(rows.map((r) => r.resource_id)))
      setOccupiedResourceIds(ids)
    } catch {
      setOccupiedResourceIds([])
    } finally {
      setOccupancyBusy(false)
    }
  }, [businessId, selectedPlanId])

  const refreshBackgroundUrl = useCallback(async () => {
    const bg = currentLayout.background
    if (!bg || bg.bucket !== 'business-private' || !bg.path) {
      setBgUrl(null)
      return
    }
    setBgBusy(true)
    try {
      const url = await createBusinessPrivateSignedUrl({ path: bg.path, expiresIn: 3600 })
      setBgUrl(url)
    } catch {
      setBgUrl(null)
    } finally {
      setBgBusy(false)
    }
  }, [currentLayout.background])

  useEffect(() => {
    if (ecosystem?.resource_management_enabled) {
      loadBundles()
    }
  }, [ecosystem?.resource_management_enabled, loadBundles])

  useEffect(() => {
    if (!selectedPlanId) return
    void refreshBackgroundUrl()
    void refreshOccupancy()
  }, [selectedPlanId, refreshBackgroundUrl, refreshOccupancy])

  useEffect(() => {
    if (!businessId) return
    const channel = supabase
      .channel(`floor_plan_occupancy:${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void refreshOccupancy()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [businessId, refreshOccupancy])

  const clearPersistTimer = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
  }, [])

  const handleSaveLayout = useCallback(
    async (
      layout: LayoutJson,
      options?: {
        skipReloadBundles?: boolean
        floorPlanId?: string | null
        floorPlanName?: string
      },
    ) => {
      const fpId = options?.floorPlanId ?? selectedPlanId
      if (!fpId) return
      const fpName = options?.floorPlanName ?? selectedBundle?.floor_plan_name ?? 'Piano'
      setSaving(true)
      setError(null)
      try {
        await upsertFloorPlan(businessId, fpName, layout, true, fpId)
        if (!options?.skipReloadBundles) {
          await loadBundles()
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      } finally {
        setSaving(false)
      }
    },
    [businessId, selectedPlanId, selectedBundle, loadBundles],
  )

  const scheduleSaveLayout = useCallback(
    (layout: LayoutJson) => {
      pendingLayoutRef.current = layout
      clearPersistTimer()
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null
        const pending = pendingLayoutRef.current
        const ctx = floorPlanCtxRef.current
        if (!pending || !ctx.id) return
        void handleSaveLayout(pending, { skipReloadBundles: true, floorPlanId: ctx.id, floorPlanName: ctx.name })
      }, LAYOUT_SAVE_DEBOUNCE_MS)
    },
    [clearPersistTimer, handleSaveLayout],
  )

  useEffect(() => () => clearPersistTimer(), [clearPersistTimer])

  const handleCreatePlan = async () => {
    if (!newPlanName.trim()) return
    try {
      const id = await upsertFloorPlan(businessId, newPlanName.trim(), DEFAULT_LAYOUT, true)
      await loadBundles()
      setSelectedPlanId(id)
      setCurrentLayout(DEFAULT_LAYOUT)
      setNewPlanName('')
      setShowNewPlan(false)
      setActiveTab('editor')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create plan')
    }
  }

  const handleSelectPlan = (planId: string) => {
    clearPersistTimer()
    const toFlush = pendingLayoutRef.current ?? currentLayout
    pendingLayoutRef.current = null
    if (selectedPlanId) {
      void handleSaveLayout(toFlush, {
        floorPlanId: selectedPlanId,
        floorPlanName: selectedBundle?.floor_plan_name ?? 'Piano',
      })
    }
    setSelectedPlanId(planId)
    const bundle = bundles.find((b) => b.floor_plan_id === planId)
    if (bundle) {
      setCurrentLayout(bundle.layout_json)
    }
    setOccupiedResourceIds([])
    setBgUrl(null)
    setActiveTab('editor')
  }

  const handleDeletePlan = async (planId: string) => {
    clearPersistTimer()
    pendingLayoutRef.current = null
    try {
      await deleteFloorPlan(businessId, planId)
      await loadBundles()
      if (selectedPlanId === planId) {
        setSelectedPlanId(bundles.length > 1 ? bundles.find((b) => b.floor_plan_id !== planId)?.floor_plan_id ?? null : null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete plan')
    }
    setDeleteConfirmId(null)
  }

  const handleAddNode = async () => {
    if (!selectedPlanId || !ecosystem) return
    const kind = resourceAddKind
    const prefix = kind === 'station' ? 'P' : kind === 'seat' ? 'S' : 'T'
    const suffix = Date.now().toString().slice(-3)
    const label = `${prefix}${suffix}`
    const resourceId = await upsertBookingResource(businessId, {
      floorPlanId: selectedPlanId,
      kind,
      label,
      capacityMin: kind === 'table' ? 2 : 1,
      capacityMax: kind === 'table' ? 4 : 1,
      metadata: { shape: 'rect', zone: 'default' },
    })
    const newNode: LayoutNode = {
      id: makeNodeId(),
      resource_id: resourceId,
      type: kind === 'station' ? 'station' : kind === 'seat' ? 'seat' : 'table',
      x: 0.1 + Math.random() * 0.3,
      y: 0.1 + Math.random() * 0.3,
      width: 0.125,
      height: 0.083,
      rotation: 0,
      zone: 'default',
      shape: 'rect',
      label,
    }
    const newLayout = { ...currentLayout, nodes: [...currentLayout.nodes, newNode] }
    setCurrentLayout(newLayout)
    await handleSaveLayout(newLayout)
    await refreshOccupancy()
  }

  const handleUploadBackground = async (file: File) => {
    if (!selectedPlanId) return
    setError(null)
    setBgBusy(true)
    try {
      const uploaded = await uploadBusinessPrivateMedia({
        businessId,
        file,
        key: `floor-plans/${selectedPlanId}/background`,
      })
      const next: LayoutJson = {
        ...currentLayout,
        background: { bucket: uploaded.bucket, path: uploaded.path, opacity: currentLayout.background?.opacity ?? 0.9, fit: currentLayout.background?.fit ?? 'contain' },
      }
      setCurrentLayout(next)
      await handleSaveLayout(next)
      const url = await createBusinessPrivateSignedUrl({ path: uploaded.path, expiresIn: 3600 })
      setBgUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload background')
    } finally {
      setBgBusy(false)
    }
  }

  const handleClearBackground = async () => {
    if (!selectedPlanId) return
    const next = { ...currentLayout, background: null }
    setCurrentLayout(next)
    setBgUrl(null)
    await handleSaveLayout(next)
  }

  const handleSaveResource = async () => {
    if (!editResourceId) return
    setSavingResource(true)
    try {
      await upsertBookingResource(businessId, {
        resourceId: editResourceId,
        label: resLabel,
        kind: resKind,
        capacityMin: parseInt(resCapMin) || 1,
        capacityMax: parseInt(resCapMax) || 4,
        metadata: {
          ...resMetadata,
          zone: resZone || 'default',
          shape: 'rect',
          ...(resPhoto ? { photo: resPhoto } : {}),
        },
        isActive: resActive,
      })
      await loadBundles()
      setShowResourceModal(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save resource')
    } finally {
      setSavingResource(false)
    }
  }

  const handleDeleteResource = async (resourceId: string) => {
    try {
      await deleteBookingResource(resourceId)
      const newLayout = {
        ...currentLayout,
        nodes: currentLayout.nodes.filter((n) => n.resource_id !== resourceId),
      }
      setCurrentLayout(newLayout)
      await handleSaveLayout(newLayout)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete resource')
    }
  }

  if (!ecosystem?.resource_management_enabled) {
    return (
      <Card className="p-6">
        <Alert tone="info">Attiva la gestione risorse nelle impostazioni Ecosistema per utilizzare la planimetria.</Alert>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-white/10 pb-2">
        {(['plans', 'editor', 'resources'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded px-3 py-1.5 text-sm capitalize ${
              activeTab === tab ? 'bg-cyan-900 text-cyan-300' : 'text-white/60 hover:bg-white/5'
            }`}
          >
            {tab === 'plans' ? 'Piani' : tab === 'editor' ? 'Editor' : 'Risorse'}
          </button>
        ))}
      </div>

      {error && (
        <Alert tone="danger">
          {error}
        </Alert>
      )}

      {activeTab === 'plans' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Piani configurati</h3>
            <Button size="sm" variant="primary" onClick={() => setShowNewPlan(true)}>
              <Plus size={14} /> Nuovo piano
            </Button>
          </div>
          {loading && <p className="text-sm text-white/40">Caricamento...</p>}
          {bundles.length === 0 && !loading && (
            <p className="text-sm text-white/40">Nessun piano. Creane uno per iniziare.</p>
          )}
          {bundles.map((bundle) => (
            <div
              key={bundle.floor_plan_id}
              className={`flex items-center justify-between rounded border p-3 ${
                bundle.floor_plan_id === selectedPlanId ? 'border-cyan-500 bg-cyan-950/20' : 'border-white/10'
              }`}
            >
              <div>
                <p className="text-sm font-medium text-white">{bundle.floor_plan_name}</p>
                <p className="text-xs text-white/40">
                  {bundle.resource_count} risorse · {bundle.floor_plan_is_active ? 'Attivo' : 'Inattivo'}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleSelectPlan(bundle.floor_plan_id)} className="text-xs text-cyan-400 hover:underline">
                  Modifica
                </button>
                <button
                  onClick={() => setDeleteConfirmId(bundle.floor_plan_id)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Elimina
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'editor' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {selectedBundle?.floor_plan_name ?? 'Seleziona un piano'}
            </h3>
            <div className="flex gap-2">
              <select
                value={resourceAddKind}
                onChange={(e) => setResourceAddKind(e.target.value as ResourceKind)}
                className="h-9 rounded border border-white/20 bg-white/5 px-2 text-xs text-white"
              >
                <option value="table">Tavolo</option>
                <option value="station">Postazione</option>
                <option value="seat">Posto</option>
              </select>
              <Button size="sm" variant="secondary" onClick={handleAddNode}>
                <Plus size={14} /> Aggiungi
              </Button>
              {saving && <span className="text-xs text-white/40">Salvataggio...</span>}
              {!saving && <span className="text-xs text-green-400">Salvato</span>}
            </div>
          </div>
          {selectedPlanId && (
            <div className="flex flex-col gap-2 rounded border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs text-white/60">Sfondo planimetria</div>
                <label className="inline-flex items-center gap-2 text-xs text-cyan-300 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleUploadBackground(f)
                      e.currentTarget.value = ''
                    }}
                    disabled={bgBusy}
                  />
                  <span className="rounded bg-cyan-900/40 px-2 py-1">Carica</span>
                </label>
                {currentLayout.background?.path ? (
                  <button
                    type="button"
                    onClick={() => void handleClearBackground()}
                    className="text-xs text-red-300 hover:underline"
                    disabled={bgBusy}
                  >
                    Rimuovi
                  </button>
                ) : null}
                {bgBusy ? <span className="text-xs text-white/40">…</span> : null}
                {occupancyBusy ? <span className="ml-auto text-xs text-white/40">Aggiorno occupazione…</span> : (
                  <span className="ml-auto text-xs text-white/40">
                    Occupati: {occupiedResourceIds.length} · Snapshot: {new Date(atIso).toLocaleTimeString()}
                  </span>
                )}
              </div>
              {currentLayout.background ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-white/60">
                    Opacità
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={typeof currentLayout.background?.opacity === 'number' ? currentLayout.background.opacity : 0.9}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        const next: LayoutJson = {
                          ...currentLayout,
                          background: currentLayout.background
                            ? { ...currentLayout.background, opacity: Number.isFinite(v) ? v : 0.9 }
                            : null,
                        }
                        setCurrentLayout(next)
                        void handleSaveLayout(next)
                      }}
                      className="ml-2 align-middle"
                    />
                  </label>
                  <label className="text-xs text-white/60">
                    Fit
                    <select
                      value={currentLayout.background?.fit ?? 'contain'}
                      onChange={(e) => {
                        const fit = e.target.value === 'cover' ? 'cover' : 'contain'
                        const next: LayoutJson = {
                          ...currentLayout,
                          background: currentLayout.background ? { ...currentLayout.background, fit } : null,
                        }
                        setCurrentLayout(next)
                        void handleSaveLayout(next)
                      }}
                      className="ml-2 h-8 rounded border border-white/20 bg-white/5 px-2 text-xs text-white"
                    >
                      <option value="contain">Contain</option>
                      <option value="cover">Cover</option>
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          )}
          {selectedPlanId ? (
            <FloorPlanEditor
              layoutJson={currentLayout}
              resources={selectedBundle?.resources_json}
              backgroundUrl={bgUrl}
              occupiedResourceIds={occupiedResourceIds}
              onChange={(layout) => {
                setCurrentLayout(layout)
                scheduleSaveLayout(layout)
              }}
              readOnly={false}
            />
          ) : (
            <p className="text-sm text-white/40">Seleziona un piano dalla tab "Piani"</p>
          )}
          <div className="flex gap-4 text-xs text-white/40">
            <span>• Rosso: SAT su footprint reale (booth arrotondato sopra, ellisse campionata)</span>
            <span>• Grigio: inattivi</span>
            <span>• Blu: rettangolo, Viola: cerchio, Arancione: booth</span>
          </div>
        </div>
      )}

      {activeTab === 'resources' && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Tutte le risorse</h3>
          {bundles.flatMap((b) =>
            (b.resources_json ?? []).map((res) => (
              <div key={res.id} className="flex items-center justify-between rounded border border-white/10 p-3">
                <div>
                  <p className="text-sm font-medium text-white">{res.label}</p>
                  <p className="text-xs text-white/40">
                    {res.kind} · Capienza {res.capacity_min}–{res.capacity_max} ·{' '}
                    {res.is_active ? 'Attivo' : 'Inattivo'}
                    {res.metadata && typeof res.metadata === 'object' && 'zone' in res.metadata
                      ? ` · Zona: ${(res.metadata as Record<string, unknown>).zone ?? 'default'}`
                      : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditResourceId(res.id)
                      setResLabel(res.label)
                      setResKind(res.kind)
                      setResCapMin(String(res.capacity_min))
                      setResCapMax(String(res.capacity_max))
                      const meta = (res.metadata && typeof res.metadata === 'object' && !Array.isArray(res.metadata)) ? (res.metadata as Record<string, unknown>) : {}
                      setResMetadata(meta)
                      setResZone((meta.zone as string) ?? '')
                      setResActive(res.is_active)
                      const photo = meta.photo
                      const parsedPhoto =
                        typeof photo === 'object' && photo !== null && !Array.isArray(photo) &&
                        (photo as Record<string, unknown>).bucket === 'business-private' &&
                        typeof (photo as Record<string, unknown>).path === 'string'
                          ? { bucket: 'business-private' as const, path: (photo as Record<string, unknown>).path as string }
                          : null
                      setResPhoto(parsedPhoto)
                      setResPhotoUrl(null)
                      if (parsedPhoto) {
                        setResPhotoBusy(true)
                        void createBusinessPrivateSignedUrl({ path: parsedPhoto.path, expiresIn: 3600 })
                          .then((url) => setResPhotoUrl(url))
                          .catch(() => setResPhotoUrl(null))
                          .finally(() => setResPhotoBusy(false))
                      }
                      setShowResourceModal(true)
                    }}
                    className="text-xs text-cyan-400 hover:underline"
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => handleDeleteResource(res.id)}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            )),
          )}
          {bundles.length === 0 && <p className="text-sm text-white/40">Nessuna risorsa configurata.</p>}
        </div>
      )}

      {showNewPlan && (
        <Modal open={showNewPlan} title="Nuovo piano" onClose={() => setShowNewPlan(false)}>
          <div className="flex flex-col gap-3">
            <Input
              value={newPlanName}
              onChange={(e) => setNewPlanName(e.target.value)}
              placeholder="Nome piano (es. Sala principale)"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowNewPlan(false)}>
                Annulla
              </Button>
              <Button variant="primary" size="sm" onClick={handleCreatePlan}>
                <Plus size={14} /> Crea
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirmId && (
        <Modal open={!!deleteConfirmId} title="Eliminare questo piano?" onClose={() => setDeleteConfirmId(null)}>
          <p className="text-sm text-white/60">
            L&apos;operazione disattiva il piano. Le risorse associate rimangono nel database.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteConfirmId(null)}>
              Annulla
            </Button>
            <Button variant="danger" size="sm" onClick={() => handleDeletePlan(deleteConfirmId)}>
              <Trash2 size={14} /> Elimina
            </Button>
          </div>
        </Modal>
      )}

      {showResourceModal && (
        <Modal open={showResourceModal} title="Modifica risorsa" onClose={() => setShowResourceModal(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-white/60">Etichetta</label>
              <Input value={resLabel} onChange={(e) => setResLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-white/60">Foto</label>
              <div className="mt-1 flex items-center gap-3">
                {resPhotoBusy ? (
                  <span className="text-xs text-white/40">Caricamento…</span>
                ) : resPhotoUrl ? (
                  <img src={resPhotoUrl} alt="" className="h-12 w-12 rounded object-cover border border-white/10" />
                ) : (
                  <div className="h-12 w-12 rounded border border-white/10 bg-white/5" />
                )}
                <label className="inline-flex items-center gap-2 text-xs text-cyan-300 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      const id = editResourceId
                      if (!f || !id) return
                      setResPhotoBusy(true)
                      void uploadBusinessPrivateMedia({ businessId, file: f, key: `resources/${id}/photo` })
                        .then(async (up) => {
                          setResPhoto(up)
                          setResMetadata((prev) => ({ ...prev, photo: up }))
                          const url = await createBusinessPrivateSignedUrl({ path: up.path, expiresIn: 3600 })
                          setResPhotoUrl(url)
                        })
                        .catch(() => {
                          setResPhoto(null)
                          setResPhotoUrl(null)
                          setResMetadata((prev) => {
                            const next = { ...prev }
                            delete next.photo
                            return next
                          })
                        })
                        .finally(() => setResPhotoBusy(false))
                      e.currentTarget.value = ''
                    }}
                  />
                  <span className="rounded bg-cyan-900/40 px-2 py-1">Carica</span>
                </label>
                {resPhoto ? (
                  <button
                    type="button"
                    className="text-xs text-red-300 hover:underline"
                    onClick={() => {
                      setResPhoto(null)
                      setResPhotoUrl(null)
                      setResMetadata((prev) => {
                        const next = { ...prev }
                        delete next.photo
                        return next
                      })
                    }}
                    disabled={resPhotoBusy}
                  >
                    Rimuovi
                  </button>
                ) : null}
              </div>
            </div>
            <div>
              <label className="text-xs text-white/60">Tipo</label>
              <select
                value={resKind}
                onChange={(e) => setResKind(e.target.value as typeof resKind)}
                className="mt-1 w-full rounded border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-white"
              >
                <option value="table">Tavolo</option>
                <option value="room">Stanza</option>
                <option value="chair">Sedia</option>
                <option value="station">Postazione</option>
                <option value="equipment">Attrezzatura</option>
                <option value="seat">Seduta</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-white/60">Capienza min</label>
                <Input type="number" min="1" value={resCapMin} onChange={(e) => setResCapMin(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-white/60">Capienza max</label>
                <Input type="number" min="1" value={resCapMax} onChange={(e) => setResCapMax(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-white/60">Zona</label>
              <Input value={resZone} onChange={(e) => setResZone(e.target.value)} placeholder="es. sala, finestra" />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={resActive} onChange={(e) => setResActive(e.target.checked)} />
              <span className="text-sm text-white">Attivo</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowResourceModal(false)}>
                Annulla
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveResource} disabled={savingResource}>
                {savingResource ? 'Salvataggio...' : 'Salva'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
