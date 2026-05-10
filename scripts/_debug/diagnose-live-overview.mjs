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

function host(url) {
  try {
    return new URL(url).hostname
  } catch {
    return 'invalid-url'
  }
}

async function main() {
  const baseUrl = (process.argv.find((x) => x.startsWith('--base-url=')) ?? '').slice('--base-url='.length).trim()
  const email = (process.argv.find((x) => x.startsWith('--email=')) ?? '').slice('--email='.length).trim()
  const password = (process.argv.find((x) => x.startsWith('--password=')) ?? '').slice('--password='.length).trim()

  if (!baseUrl || !email || !password) {
    process.stderr.write('[diagnose-live-overview] Usage: --base-url --email --password\n')
    process.exitCode = 1
    return
  }

  const { supabaseUrl, supabaseAnonKey } = await deriveSupabasePublicConfig(baseUrl)
  process.stdout.write(`[diagnose-live-overview] supabaseHost=${host(supabaseUrl)}\n`)

  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { error: signInErr } = await sb.auth.signInWithPassword({ email, password })
  if (signInErr) {
    process.stdout.write(`[diagnose-live-overview] SIGNIN_ERROR ${signInErr.message}\n`)
    return
  }

  const { data, error } = await sb.rpc('list_business_live_overview', {})
  if (error) {
    process.stdout.write(`[diagnose-live-overview] RPC_ERROR code=${error.code ?? '—'} message=${error.message}\n`)
    return
  }

  const rows = Array.isArray(data) ? data : []
  process.stdout.write(`[diagnose-live-overview] OK rows=${rows.length}\n`)
}

main().catch((e) => {
  process.stderr.write(`[diagnose-live-overview] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})

