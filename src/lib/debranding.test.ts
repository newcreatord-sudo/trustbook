import { describe, expect, it } from 'vitest'
import { initDebranding } from '@/lib/debranding'

describe('initDebranding', () => {
  it('hides existing TRAE SOLO badge', async () => {
    document.body.innerHTML = ''
    const badge = document.createElement('div')
    badge.textContent = 'TRAE SOLO'
    badge.style.position = 'fixed'
    document.body.appendChild(badge)

    await initDebranding()

    expect(badge.style.display).toBe('none')
  })

  it('hides dynamically inserted TRAE SOLO badge', async () => {
    document.body.innerHTML = ''
    await initDebranding()

    const badge = document.createElement('div')
    badge.textContent = 'TRAE SOLO'
    badge.style.position = 'fixed'
    document.body.appendChild(badge)

    await new Promise((r) => setTimeout(r, 0))

    expect(badge.style.display).toBe('none')
  })

  it('hides badge inside open shadow root', async () => {
    document.body.innerHTML = ''
    const host = document.createElement('div')
    host.style.position = 'fixed'
    document.body.appendChild(host)
    const sr = host.attachShadow({ mode: 'open' })
    const badge = document.createElement('div')
    badge.textContent = 'TRAE SOLO'
    sr.appendChild(badge)

    await initDebranding()

    expect(host.style.display).toBe('none')
  })
})
