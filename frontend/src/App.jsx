import { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './shared/store/authStore.js'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import ToastContainer from './shared/components/ToastContainer.jsx'
import LoginPage from './modules/auth/LoginPage.jsx'
import Layout from './shared/components/Layout.jsx'

const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage.jsx'))
const CheckinPage = lazy(() => import('./modules/checkin/CheckinPage.jsx'))
const CapacityPage = lazy(() => import('./modules/capacity/CapacityPage.jsx'))
const HousekeepingPage = lazy(() => import('./modules/housekeeping/HousekeepingPage.jsx'))
const MaintenancePage = lazy(() => import('./modules/maintenance/MaintenancePage.jsx'))
const DisciplinePage = lazy(() => import('./modules/discipline/DisciplinePage.jsx'))
const SelfServicePage = lazy(() => import('./modules/self-service/SelfServicePage.jsx'))
const RoomHistoryPage = lazy(() => import('./modules/room-history/RoomHistoryPage.jsx'))
const WhatsAppPage = lazy(() => import('./modules/whatsapp/WhatsAppPage.jsx'))
const ShiftsPage = lazy(() => import('./modules/shifts/ShiftsPage.jsx'))
const CheckoutPage = lazy(() => import('./modules/checkout/CheckoutPage.jsx'))
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage.jsx'))
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage.jsx'))
const LaundryHub = lazy(() => import('./modules/laundry/LaundryHub.jsx'))
const AuditPage = lazy(() => import('./modules/admin/AuditPage.jsx'))
const UsersPage = lazy(() => import('./modules/admin/UsersPage.jsx'))
const SettingsPage = lazy(() => import('./modules/admin/SettingsPage.jsx'))
const KioskPinPage = lazy(() => import('./modules/admin/KioskPinPage.jsx'))

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" />
}

function RoleRoute({ roles, children }) {
  const user = useAuthStore(s => s.user)
  if (!roles.includes(user?.role)) return <Navigate to="/" replace />
  return children
}

function NotFound() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'var(--mono)', color: 'var(--fg)' }}>
      <div style={{ fontSize: '48px', fontFamily: 'var(--display)', letterSpacing: '6px', marginBottom: '12px' }}>404</div>
      <p style={{ fontSize: '13px', opacity: 0.6, marginBottom: '20px' }}>Sayfa bulunamadi</p>
      <a href="/" style={{ color: 'var(--accent)', fontSize: '12px', letterSpacing: '1px' }}>ANASAYFAYA DON</a>
    </div>
  )
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!offline) return null
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'var(--red)', color: '#fff', textAlign: 'center',
      padding: '8px 16px', fontFamily: 'var(--mono)', fontSize: '11px',
      letterSpacing: '1px',
    }}>
      &#x26A0; BAGLANTI KESILDI — Veriler guncellenmeyecek
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <ToastContainer />
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'var(--mono)', letterSpacing: '2px', fontSize: '13px' }}>YUKLENIYOR...</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kiosk" element={<SelfServicePage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="checkin" element={<CheckinPage />} />
            <Route path="capacity" element={<CapacityPage />} />
            <Route path="housekeeping" element={<HousekeepingPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="discipline" element={<DisciplinePage />} />
            <Route path="room-history" element={<RoomHistoryPage />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="shifts" element={<ShiftsPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="laundry" element={<LaundryHub />} />
            <Route path="laundry/*" element={<LaundryHub />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<RoleRoute roles={['campus_manager']}><AuditPage /></RoleRoute>} />
            <Route path="users" element={<RoleRoute roles={['campus_manager']}><UsersPage /></RoleRoute>} />
            <Route path="settings" element={<RoleRoute roles={['campus_manager']}><SettingsPage /></RoleRoute>} />
            <Route path="kiosk-pins" element={<RoleRoute roles={['campus_manager']}><KioskPinPage /></RoleRoute>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
