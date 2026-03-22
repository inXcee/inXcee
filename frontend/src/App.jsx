import { useState, useEffect, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './shared/store/authStore.js'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import ToastContainer from './shared/components/ToastContainer.jsx'
import LoginPage from './modules/auth/LoginPage.jsx'
import Layout from './shared/components/Layout.jsx'
import CheckinPage from './modules/checkin/CheckinPage.jsx'
import CapacityPage from './modules/capacity/CapacityPage.jsx'
import HousekeepingPage from './modules/housekeeping/HousekeepingPage.jsx'
import MaintenancePage from './modules/maintenance/MaintenancePage.jsx'
import DisciplinePage from './modules/discipline/DisciplinePage.jsx'
import SelfServicePage from './modules/self-service/SelfServicePage.jsx'
import DashboardPage from './modules/dashboard/DashboardPage.jsx'
import RoomHistoryPage from './modules/room-history/RoomHistoryPage.jsx'
import WhatsAppPage from './modules/whatsapp/WhatsAppPage.jsx'
import ShiftsPage from './modules/shifts/ShiftsPage.jsx'
import CheckoutPage from './modules/checkout/CheckoutPage.jsx'
import InventoryPage from './modules/inventory/InventoryPage.jsx'

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" />
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
            <Route path="inventory" element={<InventoryPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
