import { describe, expect, it } from 'vitest'
import { sanitizePublicHttpUrl } from '@/lib/publicImageUrl'

describe('sanitizePublicHttpUrl', () => {
  it('accepts http(s) and returns normalized href', () => {
    expect(sanitizePublicHttpUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(sanitizePublicHttpUrl('  HTTP://LOCALHOST/x  ')).toBe('http://localhost/x')
  })

  it('rejects empty and invalid', () => {
    expect(sanitizePublicHttpUrl('')).toBeNull()
    expect(sanitizePublicHttpUrl(null)).toBeNull()
    expect(sanitizePublicHttpUrl('not a url')).toBeNull()
  })

  it('rejects non-http protocols', () => {
    expect(sanitizePublicHttpUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizePublicHttpUrl('data:image/png;base64,AAAA')).toBeNull()
    expect(sanitizePublicHttpUrl('ftp://example.com/x')).toBeNull()
    expect(sanitizePublicHttpUrl('file:///etc/passwd')).toBeNull()
  })
})
