import { describe, expect, it } from 'vitest'
import { safeParseAiSuggestionRow, safeParseAiSuggestionAuditRow } from '@/domain/parse'

describe('ai suggestions parse', () => {
  it('parses ai_suggestions row', () => {
    const ok = safeParseAiSuggestionRow({
      id: 's1',
      business_id: 'b1',
      kind: 'increase_revenue',
      priority: 80,
      title: 'Test',
      explanation: 'Why',
      evidence: ['a'],
      expected_impact: null,
      action_type: 'UPDATE_BUSINESS_MIN_GAP',
      action_payload: { min_gap_min: 10 },
      status: 'new',
      generated_at: new Date().toISOString(),
      read_at: null,
      dismissed_at: null,
      dismissed_by_user_id: null,
      applied_at: null,
      applied_by_user_id: null,
    })
    expect(ok?.id).toBe('s1')

    const bad = safeParseAiSuggestionRow({})
    expect(bad).toBe(null)
  })

  it('parses ai_suggestion_audit row', () => {
    const ok = safeParseAiSuggestionAuditRow({
      id: 'a1',
      suggestion_id: 's1',
      business_id: 'b1',
      user_id: 'u1',
      action_type: 'ADD_CUSTOMER_TAG',
      action_payload: {},
      result: 'success',
      error: null,
      created_at: new Date().toISOString(),
    })
    expect(ok?.id).toBe('a1')

    const bad = safeParseAiSuggestionAuditRow({})
    expect(bad).toBe(null)
  })
})
