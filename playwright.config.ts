import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration.
 *
 * - Local dev: `npm run e2e` → Vite dev server (default :5173).
 * - CI / production-like: `npm run e2e:ci` → serves `dist/` via `vite preview`
 *   (requires `npm run build` first). Set `E2E_USE_PREVIEW=1` locally to match CI.
 * - Override base URL with `E2E_BASE_URL` (staging smoke); disables webServer.
 */

const isCi = process.env.CI === 'true'
const usePreviewServer = isCi || process.env.E2E_USE_PREVIEW === '1'
const PORT = Number(process.env.PORT ?? 5173)
const PREVIEW_HOST = '127.0.0.1'
const BASE_URL =
  process.env.E2E_BASE_URL ??
  (usePreviewServer ? `http://${PREVIEW_HOST}:${PORT}` : `http://localhost:${PORT}`)
const previewReadyUrl = `http://${PREVIEW_HOST}:${PORT}`

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
  /** CI: Chromium only (faster, no WebKit install). Local: desktop + mobile Safari. */
  projects: isCi
    ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
      ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : usePreviewServer
      ? {
          command: `npx vite preview --host ${PREVIEW_HOST} --strictPort --port ${PORT}`,
          url: previewReadyUrl,
          timeout: 120_000,
          reuseExistingServer: !isCi,
        }
      : {
          command: 'npm run client:dev',
          url: BASE_URL,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
        },
})
