import { config as loadEnvFiles } from 'dotenv'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Sicurezza / segreti:
 * - Mai committare chiavi reali qui: usare solo `.env.local` (gitignored) o variabili d’ambiente in CI.
 * - Questi valori servono solo perché `@/lib/supabase.ts` crea il client all’import; i test devono mockare
 *   le chiamate o usare URL/chiavi reali solo via env locale.
 * - I fallback sotto sono stringhe dummy non valide per produzione (solo per far passare l’inizializzazione).
 */
loadEnvFiles({ path: '.env.local' })
loadEnvFiles()

const viteSupabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vitest-only.invalid.local'
const viteSupabaseAnon =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY_ ||
  'sb_publishable_vitest_placeholder_not_a_real_key'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Vitest must not pick up Playwright specs under e2e/ — they live on a
    // different runtime (browser-based) and use a different test API.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**', 'playwright-report/**'],
    env: {
      VITE_SUPABASE_URL: viteSupabaseUrl,
      VITE_SUPABASE_ANON_KEY: viteSupabaseAnon,
    },
  },
})
