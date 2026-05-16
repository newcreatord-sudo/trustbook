import { test, expect } from '@playwright/test'

test.describe('Auth — attività', () => {
  test('login attività apre la dashboard', async ({ page }) => {
    const email = process.env.E2E_OWNER_EMAIL ?? ''
    const password = process.env.E2E_OWNER_PASSWORD ?? ''
    test.skip(!email || !password, 'Missing E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD')

    await page.goto('/login?mode=login&role=attivita&next=%2Fdashboard-attivita')
    await page.locator('input[inputmode="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.getByRole('button', { name: 'Accedi' }).click()
    await expect(page).toHaveURL(/\/dashboard-attivita/)
  })
})

