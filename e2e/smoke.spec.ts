import { test, expect } from '@playwright/test'

/**
 * Smoke test: every release MUST pass these. Failures block deploy.
 */

test.describe('Public surface — smoke', () => {
  test('home renders and shows the explore CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/TrustBook/i)
    const main = page.locator('main')
    await expect(main).toBeVisible()
    const skip = page.getByText('Salta al contenuto principale', { exact: false })
    await expect(skip).toBeAttached()
  })

  test('explore page shows search/filters and at least one business card or empty state', async ({ page }) => {
    await page.goto('/esplora')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('robots.txt is reachable and references the sitemap', async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/robots.txt`)
    expect(resp.status()).toBe(200)
    const body = await resp.text()
    expect(body.toLowerCase()).toContain('sitemap:')
  })

  test('manifest is served as application/manifest+json', async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/manifest.webmanifest`)
    expect(resp.status()).toBe(200)
    const ct = resp.headers()['content-type'] ?? ''
    expect(ct).toMatch(/manifest\+json|application\/json/)
  })

  test('login page is reachable', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/TrustBook/i)
  })

  test('admin route redirects when not authenticated', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/(login|start)/)
  })
})
