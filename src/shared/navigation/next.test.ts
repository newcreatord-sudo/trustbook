import { describe, expect, it } from 'vitest'
import { safeNextPath } from '@/shared/navigation/next'

describe('safeNextPath', () => {
  it('accepts only internal paths', () => {
    expect(safeNextPath('/esplora')).toBe('/esplora')
    expect(safeNextPath('/prenotazioni?x=1')).toBe('/prenotazioni?x=1')

    expect(safeNextPath('https://evil.com')).toBe(null)
    expect(safeNextPath('//evil.com')).toBe(null)
    expect(safeNextPath('evil')).toBe(null)
    expect(safeNextPath('')).toBe(null)
  })
})

