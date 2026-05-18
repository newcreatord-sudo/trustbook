import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Pages scanned without color-contrast (marketing gradients / noisy surfaces). */
const ROUTES_PARTIAL: Array<{ path: string; label: string; disableRules?: string[] }> = [
  { path: '/', label: 'home', disableRules: ['color-contrast'] },
  /* Google Maps web components expose role=button markers without SR names — third-party. */
  {
    path: '/esplora',
    label: 'explore',
    disableRules: ['color-contrast', 'aria-command-name'],
  },
  { path: '/start', label: 'start', disableRules: ['color-contrast'] },
]

for (const r of ROUTES_PARTIAL) {
  test(`a11y · ${r.label} has no serious/critical (scoped rules)`, async ({ page }) => {
    await page.goto(r.path)
    await page.waitForLoadState('networkidle')
    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    const rules = r.disableRules ?? ['color-contrast']
    builder = builder.disableRules(rules)
    const results = await builder.analyze()
    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })
}

test.describe('a11y · login (includes color-contrast)', () => {
  test('login has no serious/critical violations', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })
})
