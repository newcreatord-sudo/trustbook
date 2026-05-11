import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Flag, Gavel, ShieldCheck, Users } from 'lucide-react'
import AppShell from '@/components/AppShell'
import Card from '@/shared/ui/Card'
import { supabase } from '@/lib/supabase'

type Stat = { label: string; value: number | string; hint?: string; icon: React.ReactNode; tone: string }

/**
 * Platform admin landing — high-level Trust & Safety stats and quick links
 * to moderation tools. This is intentionally read-only at first iteration;
 * mutation surfaces (suspend user, force-refund, override score) will be
 * separate routes once the moderation review process is in place.
 *
 * The component never calls the service role: each stat resolves via an RPC
 * or an aggregate SELECT that is RLS-protected and admin-only.
 */
export default function AdminDashboard() {
  const [stats, setStats] = useState<Stat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [pendingReviews, openReports, lastAudit, suspendedBusinesses] = await Promise.all([
          supabase.from('reviews').select('id', { head: true, count: 'exact' }).eq('moderation_status', 'pending'),
          supabase.from('review_reports').select('id', { head: true, count: 'exact' }).eq('status', 'open'),
          supabase
            .from('admin_audit_log')
            .select('action, created_at')
            .order('created_at', { ascending: false })
            .limit(1),
          supabase.from('businesses').select('id', { head: true, count: 'exact' }).eq('is_paused', true),
        ])

        if (cancelled) return
        const lastEvent = lastAudit.data?.[0] ?? null
        setStats([
          {
            label: 'Recensioni in revisione',
            value: pendingReviews.count ?? 0,
            icon: <Flag className="h-5 w-5" aria-hidden />,
            tone: 'text-amber-300',
            hint: 'Da moderare nella coda T&S',
          },
          {
            label: 'Segnalazioni aperte',
            value: openReports.count ?? 0,
            icon: <AlertTriangle className="h-5 w-5" aria-hidden />,
            tone: 'text-rose-300',
            hint: 'Report cliente in attesa',
          },
          {
            label: 'Business sospesi',
            value: suspendedBusinesses.count ?? 0,
            icon: <Gavel className="h-5 w-5" aria-hidden />,
            tone: 'text-sky-300',
            hint: 'In pausa o sotto verifica',
          },
          {
            label: 'Ultima azione admin',
            value: lastEvent
              ? new Date(lastEvent.created_at as string).toLocaleString('it-IT')
              : '—',
            icon: <ShieldCheck className="h-5 w-5" aria-hidden />,
            tone: 'text-emerald-300',
            hint: lastEvent?.action ?? 'Nessuna azione recente',
          },
        ])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a8b9ff]/85">Pannello admin</div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Trust &amp; Safety</h1>
          <p className="text-sm text-white/65">
            Strumenti di moderazione, audit e supervisione. Ogni azione è registrata in
            <code className="ml-1 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs">admin_audit_log</code>.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(loading
            ? (Array.from({ length: 4 }).map(() => ({
                label: '—',
                value: '—',
                icon: <Users className="h-5 w-5" aria-hidden />,
                tone: '',
                hint: '',
              })) as Stat[])
            : stats
          ).map((s, idx) => (
            <Card key={`${s.label}_${idx}`} className="p-4">
              <div className={`flex items-center gap-2 text-sm font-semibold ${s.tone}`}>
                {s.icon}
                <span>{s.label}</span>
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{s.value}</div>
              {s.hint ? <div className="mt-1 text-xs text-white/55">{s.hint}</div> : null}
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <div className="text-sm font-semibold text-white">Strumenti rapidi</div>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <Link
                to="/admin/recensioni"
                className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/85 hover:border-white/20 hover:bg-white/[0.08]"
              >
                <div className="font-semibold">Coda recensioni</div>
                <div className="text-xs text-white/55">Modera le recensioni e segnalazioni.</div>
              </Link>
            </li>
            <li>
              <Link
                to="/admin/audit"
                className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/85 hover:border-white/20 hover:bg-white/[0.08]"
              >
                <div className="font-semibold">Audit log</div>
                <div className="text-xs text-white/55">Cronologia delle azioni privilegiate.</div>
              </Link>
            </li>
            <li>
              <Link
                to="/admin/business"
                className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/85 hover:border-white/20 hover:bg-white/[0.08]"
              >
                <div className="font-semibold">Business</div>
                <div className="text-xs text-white/55">Pausa, sblocco, verifica documenti.</div>
              </Link>
            </li>
          </ul>
        </Card>
      </div>
    </AppShell>
  )
}
