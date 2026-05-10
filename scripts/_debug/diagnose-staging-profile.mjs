import { createClient } from '@supabase/supabase-js'

async function deriveSupabasePublicConfig(baseUrl) {
  const htmlRes = await fetch(`${baseUrl.replace(/\/$/, '')}/`)
  const html = await htmlRes.text().catch(() => '')
  if (!htmlRes.ok || !html) throw new Error(`Failed to fetch HTML: HTTP ${htmlRes.status}`)

  const scriptSrc =
    html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)?.[1] ??
    html.match(/<script[^>]+src="([^"]+\/assets\/index-[^"]+\.js)"/i)?.[1] ??
    null
  if (!scriptSrc) throw new Error('Failed to locate module script src in HTML')

  const jsRes = await fetch(scriptSrc.startsWith('http') ? scriptSrc : `${baseUrl.replace(/\/$/, '')}${scriptSrc}`)
  const js = await jsRes.text().catch(() => '')
  if (!jsRes.ok || !js) throw new Error(`Failed to fetch index bundle: HTTP ${jsRes.status}`)

  const supabaseUrl = js.match(/https:\/\/[a-z0-9]{6,}\.supabase\.co/gi)?.[0] ?? null
  const jwtMatches = js.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []
  const supabaseAnonKey = jwtMatches.sort((a, b) => b.length - a.length)[0] ?? null

  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Failed to derive SUPABASE_URL / SUPABASE_ANON_KEY from bundle')
  return { supabaseUrl, supabaseAnonKey }
}

function redactHost(url) {
  try {
    return new URL(url).hostname
  } catch {
    return 'invalid-url'
  }
}

function fail(msg) {
  process.stderr.write(`[diagnose-staging-profile] ${msg}\n`)
  process.exitCode = 1
}

async function main() {
  const baseUrl = (process.argv.find((x) => x.startsWith('--base-url=')) ?? '').slice('--base-url='.length).trim()
  const email = (process.argv.find((x) => x.startsWith('--email=')) ?? '').slice('--email='.length).trim()
  const password = (process.argv.find((x) => x.startsWith('--password=')) ?? '').slice('--password='.length).trim()

  if (!baseUrl) return fail('Missing --base-url=https://...')
  if (!email) return fail('Missing --email=...')
  if (!password) return fail('Missing --password=...')

  const { supabaseUrl, supabaseAnonKey } = await deriveSupabasePublicConfig(baseUrl)
  process.stdout.write(`[diagnose-staging-profile] derivedSupabaseHost=${redactHost(supabaseUrl)}\n`)

  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({ email, password })
  if (signInErr) {
    process.stdout.write(
      `[diagnose-staging-profile] SIGNIN_ERROR status=${signInErr.status ?? '—'} code=${signInErr.code ?? '—'} message=${signInErr.message}\n`,
    )
    return
  }

  const userId = signInData?.session?.user?.id ?? null
  process.stdout.write(`[diagnose-staging-profile] signedInUserId=${userId ?? '—'}\n`)
  if (!userId) return fail('Missing user id after sign-in')

  const { data: profile, error: profileErr } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (profileErr) {
    process.stdout.write(
      `[diagnose-staging-profile] PROFILE_ERROR code=${profileErr.code ?? '—'} message=${profileErr.message}\n`,
    )
    return
  }

  process.stdout.write(`[diagnose-staging-profile] profileFound=${profile ? 'yes' : 'no'}\n`)
}

main().catch((e) => {
  fail(String(e?.message || e))
})

