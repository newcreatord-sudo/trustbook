import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from '@/providers/AuthProvider'
import AppErrorBoundary from '@/shared/ui/AppErrorBoundary'
import ToastProvider from '@/shared/ui/ToastProvider'

const boot = document.getElementById('boot')
if (boot) boot.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
