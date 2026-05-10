import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MediaThumb from '@/shared/ui/MediaThumb'

describe('MediaThumb', () => {
  it('renders placeholder for unsafe URL without mounting hostile src', () => {
    render(<MediaThumb src="javascript:alert(1)" alt="Logo attività" fallbackLabel="ACME" zoom={false} />)
    expect(screen.queryByAltText('Logo attività')).toBeNull()
    expect(screen.getByRole('img', { name: 'Logo attività' }).textContent).toBe('A')
  })

  it('retries once with cache-bust param then falls back', () => {
    render(<MediaThumb src="https://example.test/logo.png" alt="Logo attività" fallbackLabel="X" zoom={false} />)
    const img = screen.getByAltText('Logo attività')
    expect(img.getAttribute('src')).toBe('https://example.test/logo.png')
    fireEvent.error(img)
    const img2 = screen.getByAltText('Logo attività')
    expect(img2.getAttribute('src')).toContain('tb_retry')
    fireEvent.error(img2)
    expect(screen.queryByAltText('Logo attività')).toBeNull()
    expect(screen.getByRole('img', { name: 'Logo attività' }).textContent).toBe('X')
  })
})
