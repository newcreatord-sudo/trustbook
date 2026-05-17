import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'

export type GenerateBusinessSuggestionsResult =
  | { ok: true }
  | { ok: false; code: 'owner_only' | 'rpc_missing' | 'unknown'; message: string }

function classifyRpcError(e: unknown): GenerateBusinessSuggestionsResult {
  const msg = errorMessage(e, 'Errore RPC.')
  if (msg.includes('owner_only')) {
    return { ok: false, code: 'owner_only', message: 'Solo owner attività può generare suggerimenti.' }
  }
  if (
    msg.includes('Could not find the function') ||
    msg.includes('schema cache') ||
    msg.includes('mark_ai_suggestion_read') ||
    msg.includes('dismiss_ai_suggestion') ||
    msg.includes('generate_ai_suggestions')
  ) {
    return { ok: false, code: 'rpc_missing', message: 'Funzioni suggerimenti non disponibili: applicare le migrazioni database suggerimenti.' }
  }
  return { ok: false, code: 'unknown', message: msg }
}

export function explainSuggestionsLifecycleRpc(e: unknown): {
  code: 'owner_only' | 'rpc_missing' | 'ai_auto_requires_strict_off' | 'ai_auto_action_type_not_allowed' | 'unknown'
  message: string
} {
  const msg = errorMessage(e, 'Errore RPC.')
  if (msg.includes('owner_only')) {
    return { code: 'owner_only', message: 'Solo owner attività può gestire lo stato dei suggerimenti.' }
  }
  if (msg.includes('ai_auto_requires_strict_off')) {
    return { code: 'ai_auto_requires_strict_off', message: 'Conferma stretta attiva: disattivala per usare azioni automatiche.' }
  }
  if (msg.includes('ai_auto_action_type_not_allowed')) {
    return { code: 'ai_auto_action_type_not_allowed', message: 'Whitelist batch non consente questo tipo di azione automatica.' }
  }
  if (
    msg.includes('Could not find the function') ||
    msg.includes('schema cache') ||
    msg.includes('mark_ai_suggestion_read') ||
    msg.includes('dismiss_ai_suggestion') ||
    msg.includes('generate_ai_suggestions')
  ) {
    return { code: 'rpc_missing', message: 'Funzioni suggerimenti non disponibili: applicare le migrazioni database suggerimenti.' }
  }
  return { code: 'unknown', message: msg }
}

export async function generateBusinessSuggestions(businessId: string, rangeDays: number): Promise<GenerateBusinessSuggestionsResult> {
  try {
    const { error } = await supabase.rpc('generate_ai_suggestions', {
      p_business_id: businessId,
      p_range_days: rangeDays,
    })
    if (error) throw error
    return { ok: true }
  } catch (e: unknown) {
    return classifyRpcError(e)
  }
}

export async function applyBusinessSuggestion(suggestionId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.rpc('apply_ai_suggestion', { p_suggestion_id: suggestionId })
    if (error) throw error
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, message: errorMessage(e, 'Impossibile applicare il suggerimento.') }
  }
}

export async function markBusinessSuggestionRead(suggestionId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.rpc('mark_ai_suggestion_read', { p_suggestion_id: suggestionId })
    if (error) throw error
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, message: errorMessage(e, 'Impossibile segnare come letto.') }
  }
}

export async function dismissBusinessSuggestion(suggestionId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.rpc('dismiss_ai_suggestion', { p_suggestion_id: suggestionId })
    if (error) throw error
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, message: errorMessage(e, 'Impossibile scartare il suggerimento.') }
  }
}
