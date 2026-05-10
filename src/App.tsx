import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import ProtectedRoute from '@/components/ProtectedRoute'
import RoleGate from '@/components/RoleGate'
import { AppEntryWithSuspense } from '@/pages/AppEntry'

const Login = lazy(() => import('@/pages/Login'))
const Start = lazy(() => import('@/pages/Start'))
const Home = lazy(() => import('@/pages/Home'))
const ExternalListingDetail = lazy(() => import('@/pages/ExternalListingDetail'))
const BusinessDetail = lazy(() => import('@/pages/BusinessDetail'))
const Bookings = lazy(() => import('@/pages/Bookings'))
const BusinessDashboard = lazy(() => import('@/pages/BusinessDashboard'))
const Profile = lazy(() => import('@/pages/Profile'))
const Settings = lazy(() => import('@/pages/Settings'))
const CustomerDashboard = lazy(() => import('@/pages/CustomerDashboard'))
const BusinessOnboarding = lazy(() => import('@/pages/onboarding/BusinessOnboarding'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const BusinessPayments = lazy(() => import('@/pages/BusinessPayments'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const AuthCallback = lazy(() => import('@/pages/AuthCallback'))
const AiSuggestionDetail = lazy(() => import('@/pages/AiSuggestionDetail'))

function PageFallback() {
  return (
    <div className="tb-page flex min-h-[60vh] items-center justify-center">
      <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
        <div className="h-4 w-36 animate-pulse rounded-lg bg-white/10" />
      </div>
    </div>
  )
}

function CanonicalHostRedirect() {
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const raw = String(import.meta.env.VITE_APP_URL ?? '').trim()
    if (!raw) return
    let canonical: URL
    try {
      canonical = new URL(raw)
    } catch {
      return
    }

    const canonicalHost = canonical.hostname.toLowerCase()
    const altHost = canonicalHost.startsWith('www.')
      ? canonicalHost.slice(4)
      : `www.${canonicalHost}`
    const currentHost = window.location.hostname.toLowerCase()
    if (currentHost !== canonicalHost && currentHost !== altHost) return
    if (window.location.origin === canonical.origin) return

    const next =
      canonical.origin +
      window.location.pathname +
      window.location.search +
      window.location.hash
    window.location.replace(next)
  }, [])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <CanonicalHostRedirect />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/start" element={<Start />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<AppEntryWithSuspense />} />
          <Route
            path="/esplora"
            element={
              <Home />
            }
          />
          <Route
            path="/scheda/:slug"
            element={
              <ExternalListingDetail />
            }
          />
          <Route
            path="/attivita/:id"
            element={
              <BusinessDetail />
            }
          />
          <Route
            path="/b/:slug"
            element={
              <BusinessDetail />
            }
          />
          <Route
            path="/prenotazioni"
            element={
              <ProtectedRoute>
                <RoleGate role="cliente">
                  <Bookings />
                </RoleGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard-cliente"
            element={
              <ProtectedRoute>
                <RoleGate role="cliente">
                  <CustomerDashboard />
                </RoleGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard-attivita"
            element={
              <ProtectedRoute>
                <RoleGate role="attivita">
                  <BusinessDashboard />
                </RoleGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding-attivita"
            element={
              <ProtectedRoute>
                <RoleGate role="attivita">
                  <BusinessOnboarding />
                </RoleGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profilo"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/impostazioni"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route path="/settings" element={<Navigate to="/impostazioni" replace />} />
          <Route path="/dashboard-business" element={<Navigate to="/dashboard-attivita" replace />} />
          <Route path="/dashboard-customer" element={<Navigate to="/dashboard-cliente" replace />} />
          <Route
            path="/suggestions/:id"
            element={
              <ProtectedRoute>
                <RoleGate role="attivita">
                  <AiSuggestionDetail />
                </RoleGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifiche"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pagamenti-attivita"
            element={
              <ProtectedRoute>
                <RoleGate role="attivita">
                  <BusinessPayments />
                </RoleGate>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  )
}
