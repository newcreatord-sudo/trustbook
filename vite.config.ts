import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const enableDevLocator = mode !== 'production'
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
  const sentryOrg = process.env.SENTRY_ORG
  const sentryProject = process.env.SENTRY_PROJECT
  const sentryRelease = process.env.SENTRY_RELEASE ?? process.env.VITE_RELEASE_TAG ?? process.env.RELEASE_TAG
  const enableSentrySourcemaps = mode === 'production' && Boolean(sentryAuthToken && sentryOrg && sentryProject)

  return {
    plugins: [
      react({
        babel: enableDevLocator
          ? {
              plugins: [
                'react-dev-locator',
              ],
            }
          : undefined,
      }),
      traeBadgePlugin({
        variant: 'dark',
        position: 'bottom-right',
        prodOnly: true,
        clickable: true,
        clickUrl: 'https://www.trae.ai/solo?showJoin=1',
        autoTheme: true,
        autoThemeTarget: '#root'
      }),
      tsconfigPaths(),
      // PWA: generates manifest + service worker (Workbox).
      // Strategy: `injectManifest` would let us hand-write the SW, but for now
      // `generateSW` is sufficient and covers offline navigation fallback,
      // runtime cache for images/static assets, and bypass for /api/*.
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.png', 'icons/*.svg'],
        manifestFilename: 'manifest.webmanifest',
        manifest: {
          name: 'TrustBook',
          short_name: 'TrustBook',
          description: 'Prenotazioni affidabili anti no-show: caparra intelligente, regole chiare, profili verificabili.',
          lang: 'it',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'portrait',
          background_color: '#0b1220',
          theme_color: '#0b1220',
          categories: ['business', 'productivity', 'lifestyle'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Esplora', url: '/esplora', description: 'Trova attività vicino a te' },
            { name: 'Le mie prenotazioni', url: '/prenotazioni', description: 'Apri le prenotazioni attive' },
            { name: 'Dashboard attività', url: '/dashboard-attivita', description: 'Pannello per attività' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          navigateFallback: '/offline.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'fonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
      ...(enableSentrySourcemaps
        ? [
            sentryVitePlugin({
              authToken: sentryAuthToken,
              org: sentryOrg,
              project: sentryProject,
              release: sentryRelease ? { name: sentryRelease } : undefined,
            }),
          ]
        : []),
    ],
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      // Mapbox is intentionally lazy-loaded in dedicated routes/components.
      // Keep warnings focused on unexpected large chunks, not known heavy map runtime.
      chunkSizeWarningLimit: 1800,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            icons: ['lucide-react'],
            maps: ['@vis.gl/react-google-maps'],
          },
        },
      },
    },
  }
})
