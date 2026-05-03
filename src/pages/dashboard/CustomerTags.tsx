import { useEffect, useMemo, useState } from 'react'
import { Plus, Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { BusinessCustomerTagRow } from '@/domain/supabase'
import { errorMessage } from '@/lib/errors'

const SUGGESTED_TAGS = ['ritardo', 'no_show', 'VIP', 'nuovo', 'rischio']

export default function CustomerTags(props: {
  businessId: string
  customerUserId: string
  isOwner: boolean
  busy?: boolean
  onChanged?: (tags: string[]) => void
}) {
  const { businessId, customerUserId, onChanged } = props
  const [rows, setRows] = useState<BusinessCustomerTagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [tagDraft, setTagDraft] = useState('ritardo')

  useEffect(() => {
    if (!props.isOwner) {
      setRows([])
      setError(null)
      setLoading(false)
      onChanged?.([])
      return
    }

    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('business_customer_tags')
          .select('*')
          .eq('business_id', businessId)
          .eq('customer_user_id', customerUserId)
          .order('created_at', { ascending: false })
        if (!mounted) return
        if (error) throw error
        setRows((data as BusinessCustomerTagRow[]) ?? [])
        onChanged?.(((data as BusinessCustomerTagRow[]) ?? []).map((x) => x.tag))
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento tag.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [businessId, customerUserId, onChanged, props.isOwner])

  const tags = useMemo(() => rows.map((r) => r.tag), [rows])

  const addTag = (tag: string) => {
    const t = tag.trim().slice(0, 32)
    if (!t) return
    if (tags.includes(t)) return
    setError(null)
    setAdding(true)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('business_customer_tags')
          .insert({ business_id: props.businessId, customer_user_id: props.customerUserId, tag: t })
          .select('*')
        if (error) throw error
        setRows((prev) => {
          const next = ([...((data as BusinessCustomerTagRow[]) ?? []), ...prev] as BusinessCustomerTagRow[])
          onChanged?.(next.map((x) => x.tag))
          return next
        })
      } catch (e: unknown) {
        setError(errorMessage(e, 'Errore aggiunta tag.'))
      } finally {
        setAdding(false)
      }
    })()
  }

  const removeTag = (id: string) => {
    setError(null)
    setAdding(true)
    ;(async () => {
      try {
        const { error } = await supabase.from('business_customer_tags').delete().eq('id', id)
        if (error) throw error
        setRows((prev) => {
          const next = prev.filter((x) => x.id !== id)
          onChanged?.(next.map((x) => x.tag))
          return next
        })
      } catch (e: unknown) {
        setError(errorMessage(e, 'Errore rimozione tag.'))
      } finally {
        setAdding(false)
      }
    })()
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wide text-white/60">TAG CLIENTE</div>
          <div className="mt-1 text-[11px] text-white/60">Promemoria rapidi per lavorare più veloce.</div>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
          {error}
        </div>
      )}

      {!props.isOwner ? (
        <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
          Solo l'owner può gestire i tag cliente.
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {loading ? (
          <div className="text-xs text-white/60">Caricamento…</div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-white/60">Nessun tag.</div>
        ) : (
          rows.map((r) => (
            <span
              key={r.id}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-semibold',
                r.tag === 'no_show'
                  ? 'border-red-500/30 bg-red-500/10 text-red-100'
                  : r.tag === 'ritardo'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-50'
                    : r.tag.toLowerCase() === 'vip'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50'
                      : 'border-white/10 bg-white/5 text-white/80',
              )}
            >
              <Tag className="h-3.5 w-3.5" />
              {r.tag}
              <button
                type="button"
                disabled={!props.isOwner || props.busy || adding}
                onClick={() => removeTag(r.id)}
                className="rounded-full p-0.5 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Rimuovi tag"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          disabled={!props.isOwner || props.busy || adding}
          className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
        >
          {SUGGESTED_TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!props.isOwner || props.busy || adding}
          onClick={() => addTag(tagDraft)}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition',
            props.busy || adding ? 'cursor-not-allowed bg-white/10 text-white/40' : 'bg-white/10 text-white hover:bg-white/15',
          )}
        >
          <Plus className="h-4 w-4" />
          Aggiungi
        </button>
      </div>
    </div>
  )
}
