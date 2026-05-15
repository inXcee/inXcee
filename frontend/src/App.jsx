import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from './shared/store/authStore.js'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import ToastContainer from './shared/components/ToastContainer.jsx'
import ConfirmDialog from './shared/components/ConfirmDialog.jsx'
import PwaInstallPrompt from './shared/components/PwaInstallPrompt.jsx'
import LoginPage from './modules/auth/LoginPage.jsx'
import api from './shared/api/client.js'
import Layout from './shared/components/Layout.jsx'
import MobileLayout from './modules/mobile/shared/MobileLayout.jsx'
import MobileProtected from './modules/mobile/shared/MobileProtected.jsx'

const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage.jsx'))
const CampusMapPage = lazy(() => import('./modules/campus-map/CampusMapPage.jsx'))
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
const BulkActionsPage = lazy(() => import('./modules/bulk-actions/BulkActionsPage.jsx'))
const CompaniesPage = lazy(() => import('./modules/companies/CompaniesPage.jsx'))
const VisitorsPage = lazy(() => import('./modules/visitors/VisitorsPage.jsx'))
const SurveysPage = lazy(() => import('./modules/surveys/SurveysPage.jsx'))
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage.jsx'))
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage.jsx'))
const LaundryHub = lazy(() => import('./modules/laundry/LaundryHub.jsx'))
const AuditPage = lazy(() => import('./modules/admin/AuditPage.jsx'))
const UsersPage = lazy(() => import('./modules/admin/UsersPage.jsx'))
const SettingsPage = lazy(() => import('./modules/admin/SettingsPage.jsx'))
const SettingsLayout = lazy(() => import('./modules/admin/SettingsLayout.jsx'))
const KioskPinPage = lazy(() => import('./modules/admin/KioskPinPage.jsx'))
const AnnouncementsPage = lazy(() => import('./modules/admin/AnnouncementsPage.jsx'))
const AvsWorkersPage = lazy(() => import('./modules/admin/AvsWorkersPage.jsx'))
const LaundryKioskPage = lazy(() => import('./modules/laundry-kiosk/LaundryKioskPage.jsx'))
const MobileLogin = lazy(() => import('./modules/mobile/auth/MobileLogin.jsx'))
const HousekeeperHome = lazy(() => import('./modules/mobile/housekeeper/HousekeeperHome.jsx'))
const TaskDetail = lazy(() => import('./modules/mobile/housekeeper/TaskDetail.jsx'))
const FaultReport = lazy(() => import('./modules/mobile/housekeeper/FaultReport.jsx'))
const TaskHistory = lazy(() => import('./modules/mobile/housekeeper/TaskHistory.jsx'))
const TechnicianHome = lazy(() => import('./modules/mobile/technician/TechnicianHome.jsx'))
const RequestDetail = lazy(() => import('./modules/mobile/technician/RequestDetail.jsx'))
const QuickFault = lazy(() => import('./modules/mobile/technician/QuickFault.jsx'))
const DndRooms = lazy(() => import('./modules/mobile/housekeeper/DndRooms.jsx'))
const LaundryMobileHome = lazy(() => import('./modules/mobile/laundry/LaundryHome.jsx'))
const LaundryMobileMachines = lazy(() => import('./modules/mobile/laundry/MachineList.jsx'))
const LaundryMobileSearch = lazy(() => import('./modules/mobile/laundry/SearchPerson.jsx'))
const LaundryMobileBagScan = lazy(() => import('./modules/mobile/laundry/BagScan.jsx'))
const SupervisorHome = lazy(() => import('./modules/mobile/supervisor/SupervisorHome.jsx'))
const SupervisorAttendance = lazy(() => import('./modules/mobile/supervisor/AttendanceList.jsx'))
const SupervisorDiscipline = lazy(() => import('./modules/mobile/supervisor/DisciplineQuick.jsx'))
const ManagerHome = lazy(() => import('./modules/mobile/manager/ManagerHome.jsx'))
const ManagerHeatmap = lazy(() => import('./modules/mobile/manager/BlockHeatmap.jsx'))
const ManagerMap = lazy(() => import('./modules/mobile/manager/MobileCampusMap.jsx'))
const ManagerMaintenance = lazy(() => import('./modules/mobile/manager/ManagerMaintenance.jsx'))
const MobileNotifications = lazy(() => import('./modules/mobile/shared/NotificationsPage.jsx'))
const SetupPage = lazy(() => import('./modules/setup/SetupPage.jsx'))
const ErrorLogPage = lazy(() => import('./modules/admin/ErrorLogPage.jsx'))
const BackupPage = lazy(() => import('./modules/admin/BackupPage.jsx'))
const KvkkAdminPage = lazy(() => import('./modules/admin/KvkkAdminPage.jsx'))
const SystemHealthPage = lazy(() => import('./modules/admin/SystemHealthPage.jsx'))
const NotificationPrefsPage = lazy(() => import('./modules/notification-prefs/NotificationPrefsPage.jsx'))
const NotificationsCenterPage = lazy(() => import('./modules/notifications/NotificationsCenterPage.jsx'))
const KvkkPage = lazy(() => import('./modules/kvkk/KvkkPage.jsx'))

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" />
}

function RoleRoute({ roles, children }) {
  const user = useAuthStore(s => s.user)
  if (!roles.includes(user?.role)) return <Navigate to="/" replace />
  return children
}

const HOUSEKEEPER_TABS = [
  { to: '/mobile/housekeeper', label: 'Görevler', icon: '🧹' },
  { to: '/mobile/housekeeper/fault', label: 'Arıza', icon: '⚠️' },
  { to: '/mobile/housekeeper/dnd', label: 'DnD', icon: '🚫' },
  { to: '/mobile/housekeeper/notifications', label: 'Bildirim', icon: '🔔' },
  { to: '/mobile/housekeeper/history', label: 'Geçmiş', icon: '📋' },
]

const TECHNICIAN_TABS = [
  { to: '/mobile/technician', label: 'Talepler', icon: '🔧' },
  { to: '/mobile/technician/quick-fault', label: 'Yeni', icon: '➕' },
  { to: '/mobile/technician/notifications', label: 'Bildirim', icon: '🔔' },
]

const LAUNDRY_TABS = [
  { to: '/mobile/laundry', label: 'Kanban', icon: '🧺' },
  { to: '/mobile/laundry/bag', label: 'Çanta', icon: '📦' },
  { to: '/mobile/laundry/machines', label: 'Makineler', icon: '⚙️' },
  { to: '/mobile/laundry/search', label: 'Ara', icon: '🔎' },
  { to: '/mobile/laundry/notifications', label: 'Bildirim', icon: '🔔' },
]

const SUPERVISOR_TABS = [
  { to: '/mobile/supervisor', label: 'Anasayfa', icon: '🏠' },
  { to: '/mobile/supervisor/attendance', label: 'Devam', icon: '📋' },
  { to: '/mobile/supervisor/discipline', label: 'Disiplin', icon: '⚠️' },
  { to: '/mobile/supervisor/notifications', label: 'Bildirim', icon: '🔔' },
]

const MANAGER_TABS = [
  { to: '/mobile/manager', label: 'KPI', icon: '📊' },
  { to: '/mobile/manager/map', label: 'Harita', icon: '🗺️' },
  { to: '/mobile/manager/heatmap', label: 'Doluluk', icon: '📊' },
  { to: '/mobile/manager/maintenance', label: 'Talepler', icon: '🔧' },
  { to: '/mobile/manager/notifications', label: 'Bildirim', icon: '🔔' },
]

function HousekeeperShell() {
  return (
    <MobileProtected role="housekeeper">
      <MobileLayout tabs={HOUSEKEEPER_TABS} />
    </MobileProtected>
  )
}

function TechnicianShell() {
  return (
    <MobileProtected role="technical">
      <MobileLayout tabs={TECHNICIAN_TABS} />
    </MobileProtected>
  )
}

function LaundryShell() {
  return (
    <MobileProtected role="laundry">
      <MobileLayout tabs={LAUNDRY_TABS} />
    </MobileProtected>
  )
}

function SupervisorShell() {
  return (
    <MobileProtected role="shift_supervisor">
      <MobileLayout tabs={SUPERVISOR_TABS} />
    </MobileProtected>
  )
}

function ManagerShell() {
  return (
    <MobileProtected role="campus_manager">
      <MobileLayout tabs={MANAGER_TABS} />
    </MobileProtected>
  )
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

function SetupGate({ children }) {
  const location = useLocation()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get('/setup/status').then(r => r.data),
    staleTime: Infinity,
    retry: 1,
  })

  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><span className="page-spinner" /></div>
  }

  // Backend down ise normal login akışına bırak — setup zorlamasın
  if (isError) return children

  const onSetup = location.pathname === '/setup'
  // Public sayfalar setup zorunluluğundan muaf (KVKK kanun gereği herkese açık)
  const publicPaths = ['/setup', '/kvkk']
  const onPublic = publicPaths.includes(location.pathname)
  if (data?.needs_setup && !onPublic) return <Navigate to="/setup" replace />
  if (!data?.needs_setup && onSetup) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastContainer />
      <ConfirmDialog />
      <PwaInstallPrompt />
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><span className="page-spinner" /></div>}>
        <SetupGate>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kvkk" element={<KvkkPage />} />
          <Route path="/kiosk" element={<SelfServicePage />} />
          <Route path="/laundry-kiosk" element={<LaundryKioskPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="campus-map" element={<CampusMapPage />} />
            <Route path="checkin" element={<CheckinPage />} />
            <Route path="capacity" element={<CapacityPage />} />
            <Route path="housekeeping" element={<HousekeepingPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="discipline" element={<DisciplinePage />} />
            <Route path="room-history" element={<RoomHistoryPage />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="shifts" element={<ShiftsPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="bulk-actions" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><BulkActionsPage /></RoleRoute>} />
            <Route path="companies" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><CompaniesPage /></RoleRoute>} />
            <Route path="visitors" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><VisitorsPage /></RoleRoute>} />
            <Route path="surveys" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><SurveysPage /></RoleRoute>} />
            <Route path="laundry" element={<LaundryHub />} />
            <Route path="laundry/*" element={<LaundryHub />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<RoleRoute roles={['campus_manager']}><AuditPage /></RoleRoute>} />
            <Route path="error-log" element={<RoleRoute roles={['campus_manager']}><ErrorLogPage /></RoleRoute>} />
            <Route path="backup" element={<RoleRoute roles={['campus_manager']}><BackupPage /></RoleRoute>} />
            <Route path="kvkk-admin" element={<RoleRoute roles={['campus_manager']}><KvkkAdminPage /></RoleRoute>} />
            <Route path="system" element={<RoleRoute roles={['campus_manager']}><SystemHealthPage /></RoleRoute>} />
            <Route path="notifications" element={<NotificationsCenterPage />} />
            <Route path="notifications/preferences" element={<NotificationPrefsPage />} />
            <Route path="users" element={<RoleRoute roles={['campus_manager']}><UsersPage /></RoleRoute>} />
            <Route path="kiosk-pins" element={<RoleRoute roles={['campus_manager']}><KioskPinPage /></RoleRoute>} />
            <Route path="announcements" element={<RoleRoute roles={['campus_manager']}><AnnouncementsPage /></RoleRoute>} />
            <Route path="avs-workers" element={<RoleRoute roles={['campus_manager']}><AvsWorkersPage /></RoleRoute>} />
            <Route path="settings" element={<RoleRoute roles={['campus_manager']}><SettingsLayout /></RoleRoute>}>
              <Route index element={<Navigate to="email" replace />} />
              <Route path="email" element={<SettingsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="kiosk-pins" element={<KioskPinPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="avs-workers" element={<AvsWorkersPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="error-log" element={<ErrorLogPage />} />
              <Route path="backup" element={<BackupPage />} />
              <Route path="kvkk-admin" element={<KvkkAdminPage />} />
              <Route path="system" element={<SystemHealthPage />} />
            </Route>
          </Route>
          <Route path="/mobile" element={<MobileLogin />} />
          <Route path="/mobile/housekeeper" element={<HousekeeperShell />}>
            <Route index element={<HousekeeperHome />} />
            <Route path="task/:id" element={<TaskDetail />} />
            <Route path="fault" element={<FaultReport />} />
            <Route path="dnd" element={<DndRooms />} />
            <Route path="notifications" element={<MobileNotifications />} />
            <Route path="history" element={<TaskHistory />} />
          </Route>
          <Route path="/mobile/technician" element={<TechnicianShell />}>
            <Route index element={<TechnicianHome />} />
            <Route path="request/:id" element={<RequestDetail />} />
            <Route path="quick-fault" element={<QuickFault />} />
            <Route path="notifications" element={<MobileNotifications />} />
          </Route>
          <Route path="/mobile/laundry" element={<LaundryShell />}>
            <Route index element={<LaundryMobileHome />} />
            <Route path="bag" element={<LaundryMobileBagScan />} />
            <Route path="machines" element={<LaundryMobileMachines />} />
            <Route path="search" element={<LaundryMobileSearch />} />
            <Route path="notifications" element={<MobileNotifications />} />
          </Route>
          <Route path="/mobile/supervisor" element={<SupervisorShell />}>
            <Route index element={<SupervisorHome />} />
            <Route path="attendance" element={<SupervisorAttendance />} />
            <Route path="discipline" element={<SupervisorDiscipline />} />
            <Route path="notifications" element={<MobileNotifications />} />
          </Route>
          <Route path="/mobile/manager" element={<ManagerShell />}>
            <Route index element={<ManagerHome />} />
            <Route path="map" element={<ManagerMap />} />
            <Route path="heatmap" element={<ManagerHeatmap />} />
            <Route path="maintenance" element={<ManagerMaintenance />} />
            <Route path="notifications" element={<MobileNotifications />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </SetupGate>
      </Suspense>
    </ErrorBoundary>
  )
}
