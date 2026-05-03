import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

function mergeSearchAndHashParams(): URLSearchParams {
  const merged = new URLSearchParams(window.location.search)
  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  if (!rawHash) return merged
  const fromHash = new URLSearchParams(rawHash)
  fromHash.forEach((value, key) => merged.set(key, value))
  return merged
}

function parseEmailOtpType(raw: string | null): EmailOtpType | null {
  if (!raw) return null
  const allowed: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']
  return (allowed as readonly string[]).includes(raw) ? (raw as EmailOtpType) : null
}

export function urlLooksLikeRecoveryRedirect(): boolean {
  const bundle = `${window.location.search}${window.location.hash}`.toLowerCase()
  return (
    bundle.includes('type=recovery') ||
    bundle.includes('code=') ||
    bundle.includes('token_hash=') ||
    bundle.includes('access_token=') ||
    bundle.includes('refresh_token=')
  )
}

export function stripAuthRedirectFromUrl(pathOnly: string): void {
  window.history.replaceState({}, document.title, pathOnly.split('?')[0] ?? pathOnly)
}

export type AuthHandshakeResult =
  | { ok: true }
  | { ok: false; errorMessage: string }

/**
 * Consuma parametri OAuth/PKCE o OTP (`token_hash` + `type`) dalla query o dall’hash,
 * poi ripulisce URL sensibile. Usare su `/auth/callback` e `/reset-password`.
 */
export async function completeAuthRedirectHandshake(pathOnly: string): Promise<AuthHandshakeResult> {
  const params = mergeSearchAndHashParams()

  const oauthErr =
    params.get('error_description')?.trim() ||
    params.get('error_code')?.trim() ||
    params.get('error')?.trim()
  if (oauthErr) {
    const readable = oauthErr.includes('%') ? decodeURIComponent(oauthErr.replace(/\+/g, ' ')) : oauthErr
    stripAuthRedirectFromUrl(pathOnly)
    return { ok: false, errorMessage: readable || 'Richiesta non autorizzata.' }
  }

  const code = params.get('code')?.trim()
  const token_hash = params.get('token_hash')?.trim()
  const type = parseEmailOtpType(params.get('type')?.trim() ?? null)
  const access_token = params.get('access_token')?.trim()
  const refresh_token = params.get('refresh_token')?.trim()

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        stripAuthRedirectFromUrl(pathOnly)
        return { ok: false, errorMessage: error.message }
      }
    } else if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type })
      if (error) {
        stripAuthRedirectFromUrl(pathOnly)
        return { ok: false, errorMessage: error.message }
      }
    } else if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) {
        stripAuthRedirectFromUrl(pathOnly)
        return { ok: false, errorMessage: error.message }
      }
    }

    stripAuthRedirectFromUrl(pathOnly)
    return { ok: true }
  } catch (e: unknown) {
    stripAuthRedirectFromUrl(pathOnly)
    return { ok: false, errorMessage: e instanceof Error ? e.message : 'Errore durante la verifica.' }
  }
}
