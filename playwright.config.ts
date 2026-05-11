import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration.
 *
 *  - Targets dev server on :5173 unless `E2E_BASE_URL` is set (preview URL on
 *    CI for staging smoke tests).
 *  - 3 retries on CI, 0 in local dev.
 *  - HTML reporter for human review, JSON for CI dashboards.
 */
const PORT = Number(process.env.PORT ?? 5173)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 3 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run client:dev',
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
})
