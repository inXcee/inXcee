import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './shared/store/authStore.js'
import LoginPage from './modules/auth/LoginPage.jsx'
import Layout from './shared/components/Layout.jsx'
import CheckinPage from './modules/checkin/CheckinPage.jsx'
import CapacityPage from './modules/capacity/CapacityPage.jsx'
import LaundryPage from './modules/laundry/LaundryPage.jsx'
import HousekeepingPage from './modules/housekeeping/HousekeepingPage.jsx'
import MaintenancePage from './modules/maintenance/MaintenancePage.jsx'
import DisciplinePage from './modules/discipline/DisciplinePage.jsx'
import SelfServicePage from './modules/self-service/SelfServicePage.jsx'
import DashboardPage from './modules/dashboard/DashboardPage.jsx'

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/kiosk" element={<SelfServicePage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="checkin" element={<CheckinPage />} />
        <Route path="capacity" element={<CapacityPage />} />
        <Route path="laundry" element={<LaundryPage />} />
        <Route path="housekeeping" element={<HousekeepingPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="discipline" element={<DisciplinePage />} />
      </Route>
    </Routes>
  )
}
