import { describe, expect, it } from 'vitest'
import { isEmailLike, isHttpUrl, isPhoneLike } from '@/utils/validators'

describe('validators', () => {
  it('isEmailLike validates common emails', () => {
    expect(isEmailLike('test@example.com')).toBe(true)
    expect(isEmailLike('bad@')).toBe(false)
  })

  it('isHttpUrl validates http(s)', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
    expect(isHttpUrl('ftp://example.com')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:image/png;base64,AAAA')).toBe(false)
  })

  it('isPhoneLike requires at least 8 digits', () => {
    expect(isPhoneLike('+39 333 123 4567')).toBe(true)
    expect(isPhoneLike('123')).toBe(false)
  })
})

