/**
 * i18n bootstrap (lazy).
 *
 * Italian remains the default for shipping, but the app is now wired for
 * future locales. Strings start as a single namespace `common` with the most
 * frequent UI labels; pages extract more as they migrate.
 *
 * Why lazy:
 *   - Until at least 2 locales exist there is no behavioral benefit, but the
 *     code path is in place so we don't have to refactor every translation
 *     callsite later.
 *
 * Usage:
 *   import { t } from '@/lib/i18n'
 *   t('common.cta.book_now')  // returns "Prenota ora" today.
 */

type Bundle = Record<string, string | Record<string, string>>

const it: Bundle = {
  'common.cta.book_now': 'Prenota ora',
  'common.cta.cancel': 'Annulla',
  'common.cta.confirm': 'Conferma',
  'common.cta.save': 'Salva',
  'common.cta.retry': 'Riprova',
  'common.cta.close': 'Chiudi',
  'common.cta.next': 'Avanti',
  'common.cta.back': 'Indietro',
  'common.cta.continue': 'Continua',
  'common.state.loading': 'Caricamento…',
  'common.state.empty': 'Nessun risultato',
  'common.state.error': 'Errore',
  'common.role.business': 'Attività',
  'common.role.customer': 'Cliente',
  'common.nav.explore': 'Esplora',
  'common.nav.bookings': 'Prenotazioni',
  'common.nav.dashboard': 'Dashboard',
  'common.nav.notifications': 'Notifiche',
  'common.nav.profile': 'Profilo',
  'common.nav.admin': 'Admin',
  'trust.tier.newcomer': 'Nuovo',
  'trust.tier.reliable': 'Affidabile',
  'trust.tier.verified': 'Verificato',
  'trust.tier.champion': 'Campione',
  'trust.tier.at_risk': 'A rischio',
  'trust.tier.blocked': 'Bloccato',
}

let currentLocale = 'it'
const bundles: Record<string, Bundle> = { it }

function flatten(bundle: Bundle, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(bundle)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else Object.assign(out, flatten(v, key))
  }
  return out
}

const flatCache: Record<string, Record<string, string>> = { it: flatten(it) }

export function setLocale(locale: string): void {
  if (!bundles[locale]) return
  currentLocale = locale
  if (!flatCache[locale]) flatCache[locale] = flatten(bundles[locale])
}

export function registerBundle(locale: string, bundle: Bundle): void {
  bundles[locale] = { ...(bundles[locale] ?? {}), ...bundle }
  flatCache[locale] = flatten(bundles[locale])
}

export function t(key: string, fallback?: string): string {
  const flat = flatCache[currentLocale] ?? flatCache.it
  const value = flat?.[key]
  return value ?? fallback ?? key
}

export function getLocale(): string {
  return currentLocale
}
