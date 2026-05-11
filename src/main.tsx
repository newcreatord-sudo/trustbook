import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from '@/providers/AuthProvider'
import AppErrorBoundary from '@/shared/ui/AppErrorBoundary'
import ToastProvider from '@/shared/ui/ToastProvider'
import { initObservability } from '@/lib/observability'
import QueryClientProvider from '@/providers/QueryClientProvider'

// Fire-and-forget: observability init never blocks the first paint.
// When VITE_SENTRY_DSN / VITE_POSTHOG_KEY are absent, this is a no-op.
void initObservability()

const boot = document.getElementById('boot')
if (boot) boot.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
