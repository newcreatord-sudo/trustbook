import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Bell,
  CalendarDays,
  Compass,
  LayoutDashboard,
  NotebookTabs,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TabItem = {
  to: string
  label: string
  icon: React.ReactNode
  badge?: number
  matchPrefixes?: string[]
}

type Props = {
  role: 'cliente' | 'attivita' | 'unknown'
  notifCount?: number
}

/**
 * Bottom tab bar dedicated to mobile (< md). Visible only when authenticated.
 *
 *  - Honors `safe-area-inset-bottom` so the bar floats above iOS home indicator.
 *  - Active state matches a path or any of its prefixes (e.g. /dashboard-attivita?tab=).
 *  - `aria-current="page"` and visible focus ring satisfy WCAG 2.1 keyboard nav.
 *  - The bar is hidden on screens >= md (the existing top nav takes over).
 *
 * Why a separate component instead of inlining in AppShell: AppShell already
 * contains 600+ lines, the bottom bar must be testable in isolation, and
 * mobile UX has its own ARIA role (`navigation`) different from the desktop tabs.
 */
export default function MobileBottomNav({ role, notifCount = 0 }: Props) {
  const loc = useLocation()

  const tabs = useMemo<TabItem[]>(() => {
    if (role === 'attivita') {
      return [
        {
          to: '/dashboard-attivita',
          label: 'Dashboard',
          icon: <LayoutDashboard className="h-5 w-5" />,
          matchPrefixes: ['/dashboard-attivita'],
        },
        {
          to: '/dashboard-attivita?tab=calendario',
          label: 'Calendario',
          icon: <CalendarDays className="h-5 w-5" />,
        },
        {
          to: '/notifiche',
          label: 'Notifiche',
          icon: <Bell className="h-5 w-5" />,
          badge: notifCount,
          matchPrefixes: ['/notifiche'],
        },
        {
          to: '/profilo',
          label: 'Profilo',
          icon: <User className="h-5 w-5" />,
          matchPrefixes: ['/profilo', '/impostazioni'],
        },
      ]
    }
    return [
      {
        to: '/esplora',
        label: 'Esplora',
        icon: <Compass className="h-5 w-5" />,
        matchPrefixes: ['/esplora', '/attivita', '/b/', '/scheda/'],
      },
      {
        to: '/prenotazioni',
        label: 'Prenotazioni',
        icon: <NotebookTabs className="h-5 w-5" />,
        matchPrefixes: ['/prenotazioni'],
      },
      {
        to: '/notifiche',
        label: 'Notifiche',
        icon: <Bell className="h-5 w-5" />,
        badge: notifCount,
        matchPrefixes: ['/notifiche'],
      },
      {
        to: '/dashboard-cliente',
        label: 'Profilo',
        icon: <User className="h-5 w-5" />,
        matchPrefixes: ['/dashboard-cliente', '/profilo', '/impostazioni'],
      },
    ]
  }, [role, notifCount])

  if (role === 'unknown') return null

  const isActive = (tab: TabItem): boolean => {
    if (loc.pathname === tab.to) return true
    if (tab.to.includes('?')) {
      const [p, q] = tab.to.split('?')
      if (loc.pathname === p && loc.search.includes(q ?? '')) return true
    }
    if (!tab.matchPrefixes?.length) return false
    return tab.matchPrefixes.some((p) => loc.pathname.startsWith(p))
  }

  return (
    <nav
      aria-label="Navigazione principale mobile"
      role="navigation"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 md:hidden tb-mobile-dock',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="grid grid-cols-4">
        {tabs.map((t) => {
          const active = isActive(t)
          return (
            <li key={`${t.to}_${t.label}`}>
              <Link
                to={t.to}
                aria-current={active ? 'page' : undefined}
                aria-label={t.badge ? `${t.label}, ${t.badge} non lette` : t.label}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold tracking-tight',
                  'transition-colors duration-tb-fast ease-tb-standard',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7CFF]/55 focus-visible:ring-inset',
                  active ? 'text-white' : 'text-white/65 hover:text-white',
                )}
              >
                <span className="relative inline-flex">
                  {t.icon}
                  {t.badge && t.badge > 0 ? (
                    <span
                      aria-hidden
                      className="absolute -right-2 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#4F7CFF] px-1 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(79,124,255,0.65)]"
                    >
                      {t.badge > 99 ? '99' : t.badge}
                    </span>
                  ) : null}
                </span>
                <span>{t.label}</span>
                {active ? (
                  <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-[#4F7CFF]" />
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
