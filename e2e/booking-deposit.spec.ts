import { test, expect } from '@playwright/test'

test.describe('Booking — caparra', () => {
  test('cliente prenota e apre checkout Stripe caparra', async ({ page }) => {
    const email = process.env.E2E_CUSTOMER_EMAIL ?? ''
    const password = process.env.E2E_CUSTOMER_PASSWORD ?? ''
    const slug = process.env.E2E_BOOKING_BUSINESS_SLUG ?? ''
    test.skip(!email || !password || !slug, 'Missing E2E_CUSTOMER_EMAIL/E2E_CUSTOMER_PASSWORD/E2E_BOOKING_BUSINESS_SLUG')

    await page.goto(`/login?mode=login&role=cliente&next=%2Fb%2F${encodeURIComponent(slug)}`)
    await page.locator('input[inputmode="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.getByRole('button', { name: 'Accedi' }).click()
    await expect(page).toHaveURL(new RegExp(`/b/${slug.replace(/[-/\\\\.^$*+?()[\\]{}|]/g, '\\\\$&')}`))

    await expect(page.getByRole('heading', { name: /Prenota ora/i })).toBeVisible()

    const slot = page.getByRole('button', { name: /\d{1,2}:\d{2}/ }).first()
    await slot.click()

    await page.getByRole('button', { name: /Conferma/i }).click()
    await expect(page.getByRole('heading', { name: /Prenotazione Creata/i })).toBeVisible()

    const pay = page.getByRole('button', { name: /Paga caparra ora/i })
    await expect(pay).toBeVisible()

    await Promise.all([
      page.waitForURL(/stripe\.com/i),
      pay.click(),
    ])
  })
})

