import { describe, expect, it } from 'vitest'
import { suggestedArchetypeFromCategory } from '@/lib/verticalPlaybooks'

describe('verticalPlaybooks', () => {
  it('maps onboarding categories to archetypes', () => {
    expect(suggestedArchetypeFromCategory('parrucchiere')).toBe('salon_beauty')
    expect(suggestedArchetypeFromCategory('ristorante')).toBe('restaurant_hospitality')
    expect(suggestedArchetypeFromCategory('tatuatore')).toBe('tattoo_bodyart')
    expect(suggestedArchetypeFromCategory('consulente')).toBe('consulting_professional')
    expect(suggestedArchetypeFromCategory('unknown_x')).toBe('generic_service')
  })
})
