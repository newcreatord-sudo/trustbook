import { describe, expect, it } from 'vitest'
import { assertBusinessImageUploadAllowed } from '@/lib/storage'

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('assertBusinessImageUploadAllowed', () => {
  it('allows jpeg/png/webp/gif within limits', () => {
    expect(() => assertBusinessImageUploadAllowed(file('a.jpg', 'image/jpeg', 100), 'logo')).not.toThrow()
    expect(() => assertBusinessImageUploadAllowed(file('b.png', 'image/png', 100), 'gallery')).not.toThrow()
    expect(() => assertBusinessImageUploadAllowed(file('c.webp', 'image/webp', 100), 'logo')).not.toThrow()
    expect(() => assertBusinessImageUploadAllowed(file('d.gif', 'image/gif', 100), 'gallery')).not.toThrow()
  })

  it('rejects oversize logo', () => {
    const big = file('huge.jpg', 'image/jpeg', 6 * 1024 * 1024)
    expect(() => assertBusinessImageUploadAllowed(big, 'logo')).toThrow(/troppo grande/)
  })

  it('rejects wrong mime type', () => {
    const bad = file('x.pdf', 'application/pdf', 100)
    expect(() => assertBusinessImageUploadAllowed(bad, 'logo')).toThrow(/Formato/)
  })

  it('allows empty mime with safe extension', () => {
    const f = file('photo.jpeg', '', 50)
    expect(() => assertBusinessImageUploadAllowed(f, 'logo')).not.toThrow()
  })

  it('rejects empty mime with bad extension', () => {
    const f = file('readme.txt', '', 50)
    expect(() => assertBusinessImageUploadAllowed(f, 'logo')).toThrow(/non riconosciuto/)
  })
})
