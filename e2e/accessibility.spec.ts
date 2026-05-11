import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ROUTES = [
  { path: '/', label: 'home' },
  { path: '/esplora', label: 'explore' },
  { path: '/login', label: 'login' },
  { path: '/start', label: 'start' },
]

for (const r of ROUTES) {
  test(`a11y · ${r.label} has no critical violations`, async ({ page }) => {
    await page.goto(r.path)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze()
    const critical = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })
}
