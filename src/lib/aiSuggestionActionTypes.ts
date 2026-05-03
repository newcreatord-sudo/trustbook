/** Tipi `action_type` prodotti da `generate_ai_suggestions` — usati per whitelist auto-agente. */

export type AiSuggestionActionType =
  | 'UPDATE_BUSINESS_DEPOSIT'
  | 'UPDATE_BUSINESS_APPROVAL_MODE'
  | 'UPDATE_SERVICE_PRICE'
  | 'UPDATE_BUSINESS_MIN_GAP'
  | 'UPDATE_BUSINESS_NOSHOW_GUARDS'
  | 'ADD_CUSTOMER_TAG'

/** Ordine e insieme = `allowed_actions` in `auto_apply_whitelisted_ai_suggestions` (vedi migrazioni 0072+). */
export const AI_BATCH_AUTOMATIC_ALLOWED_ACTION_IDS: readonly AiSuggestionActionType[] = [
  'UPDATE_BUSINESS_DEPOSIT',
  'UPDATE_BUSINESS_APPROVAL_MODE',
  'UPDATE_SERVICE_PRICE',
  'UPDATE_BUSINESS_MIN_GAP',
  'UPDATE_BUSINESS_NOSHOW_GUARDS',
  'ADD_CUSTOMER_TAG',
]

export const AI_SUGGESTION_ACTION_TYPE_OPTIONS: ReadonlyArray<{
  id: AiSuggestionActionType
  label: string
}> = [
  { id: 'UPDATE_BUSINESS_NOSHOW_GUARDS', label: 'Soglie blocco affidabilità / storico no-show' },
  { id: 'UPDATE_BUSINESS_MIN_GAP', label: 'Buffer minimo tra appuntamenti' },
  { id: 'UPDATE_SERVICE_PRICE', label: 'Prezzo servizio (suggerito)' },
  { id: 'UPDATE_BUSINESS_APPROVAL_MODE', label: 'Modalità approvazione (es. risk-based)' },
  { id: 'UPDATE_BUSINESS_DEPOSIT', label: 'Impostazioni caparra (legacy deposit_rule)' },
  { id: 'ADD_CUSTOMER_TAG', label: 'Tag cliente (alto rischio)' },
]
