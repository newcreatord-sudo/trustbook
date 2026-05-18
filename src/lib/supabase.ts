import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY_ as string | undefined)

const effectiveUrl = supabaseUrl && supabaseUrl.trim() ? supabaseUrl.trim() : 'https://invalid.supabase.co'
const effectiveAnonKey = supabaseAnonKey && supabaseAnonKey.trim() ? supabaseAnonKey.trim() : 'invalid-anon-key'

export const supabase = createClient(effectiveUrl, effectiveAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
