import { describe, expect, test } from 'vitest'
import {
  AI_BATCH_AUTOMATIC_ALLOWED_ACTION_IDS,
  AI_SUGGESTION_ACTION_TYPE_OPTIONS,
} from '@/lib/aiSuggestionActionTypes'

describe('AI batch whitelist (TS ↔ SQL contract)', () => {
  test('dashboard OPTIONS ids equal SQL allowed_actions set', () => {
    const optionIds = new Set(AI_SUGGESTION_ACTION_TYPE_OPTIONS.map((o) => o.id))
    const batchIds = new Set(AI_BATCH_AUTOMATIC_ALLOWED_ACTION_IDS)
    expect(optionIds).toEqual(batchIds)
    expect(AI_BATCH_AUTOMATIC_ALLOWED_ACTION_IDS.length).toBe(optionIds.size)
  })
})
