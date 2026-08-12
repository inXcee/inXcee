import { Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from './shared/store/authStore.js'
import { canAccess } from './modules/admin/settingsNav.js'
import { lazyWithRetry as lazy } from './shared/lazyWithRetry.js'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import ToastContainer from './shared/components/ToastContainer.jsx'
import ConfirmDialog from './shared/components/ConfirmDialog.jsx'
import InputDialog from './shared/components/InputDialog.jsx'
import PwaInstallPrompt from './shared/components/PwaInstallPrompt.jsx'
import KioskDeviceAgent from './shared/kiosk/KioskDeviceAgent.jsx'
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
const TransportPage = lazy(() => import('./modules/transport/TransportPage.jsx'))
const DriverTripPage = lazy(() => import('./modules/transport/DriverTripPage.jsx'))
const Personnel360Page = lazy(() => import('./modules/personnel/Personnel360Page.jsx'))
const StaffDossierPage = lazy(() => import('./modules/personnel/StaffDossierPage.jsx'))
const PersonnelListPage = lazy(() => import('./modules/personnel/PersonnelListPage.jsx'))
const RiskListPage = lazy(() => import('./modules/personnel/RiskListPage.jsx'))
const ArchivedPersonnelPage = lazy(() => import('./modules/personnel/ArchivedPage.jsx'))
const HrPage = lazy(() => import('./modules/hr/HrPage.jsx'))
const PayrollPage = lazy(() => import('./modules/shifts/PayrollPage.jsx'))
const HolidaysPage = lazy(() => import('./modules/shifts/HolidaysPage.jsx'))
const MailComposePage = lazy(() => import('./modules/mail-compose/MailComposePage.jsx'))
const WaterPage = lazy(() => import('./modules/water/WaterPage.jsx'))
const CombinedAbsencesPage = lazy(() => import('./modules/shifts/CombinedAbsencesPage.jsx'))
const SafetyPage = lazy(() => import('./modules/safety/SafetyPage.jsx'))
const MealsPage = lazy(() => import('./modules/meals/MealsPage.jsx'))
const PerformancePage = lazy(() => import('./modules/performance/PerformancePage.jsx'))
const CommsPage = lazy(() => import('./modules/communications/CommsPage.jsx'))
const AdvancedReportsPage = lazy(() => import('./modules/reports/AdvancedReportsPage.jsx'))
const IntegrityPage = lazy(() => import('./modules/integrity/IntegrityPage.jsx'))
const CheckoutPage = lazy(() => import('./modules/checkout/CheckoutPage.jsx'))
const BulkActionsPage = lazy(() => import('./modules/bulk-actions/BulkActionsPage.jsx'))
const CompaniesPage = lazy(() => import('./modules/companies/CompaniesPage.jsx'))
const VisitorsPage = lazy(() => import('./modules/visitors/VisitorsPage.jsx'))
const SurveysPage = lazy(() => import('./modules/surveys/SurveysPage.jsx'))
const DrillsPage = lazy(() => import('./modules/drills/DrillsPage.jsx'))
const DisplayPage = lazy(() => import('./modules/display/DisplayPage.jsx'))
const KitchenDisplayPage = lazy(() => import('./modules/display/KitchenDisplayPage.jsx'))
const DocumentsPage = lazy(() => import('./modules/documents/DocumentsPage.jsx'))
const ExpensesPage = lazy(() => import('./modules/expenses/ExpensesPage.jsx'))
const NotificationGroupsPage = lazy(() => import('./modules/notification-groups/NotificationGroupsPage.jsx'))
const AutomationPage = lazy(() => import('./modules/automation/AutomationPage.jsx'))
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage.jsx'))
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage.jsx'))
const LaundryHub = lazy(() => import('./modules/laundry/LaundryHub.jsx'))
const AuditPage = lazy(() => import('./modules/admin/AuditPage.jsx'))
const UsersPage = lazy(() => import('./modules/admin/UsersPage.jsx'))
const SettingsPage = lazy(() => import('./modules/admin/SettingsPage.jsx'))
const SettingsHomePage = lazy(() => import('./modules/admin/SettingsHomePage.jsx'))
const SettingsLayout = lazy(() => import('./modules/admin/SettingsLayout.jsx'))
const KioskPinPage = lazy(() => import('./modules/admin/KioskPinPage.jsx'))
const AnnouncementsPage = lazy(() => import('./modules/admin/AnnouncementsPage.jsx'))
const AvsWorkersPage = lazy(() => import('./modules/admin/AvsWorkersPage.jsx'))
const CardsPage = lazy(() => import('./modules/cards/CardsPage.jsx'))
const StationsPage = lazy(() => import('./modules/stations/StationsPage.jsx'))
const PresencePage = lazy(() => import('./modules/access/PresencePage.jsx'))
const StationPage = lazy(() => import('./modules/station/StationPage.jsx'))
const FeedbackPage = lazy(() => import('./modules/admin/FeedbackPage.jsx'))
const LaundryKioskPage = lazy(() => import('./modules/laundry-kiosk/LaundryKioskPage.jsx'))
const AvsSelfServicePage = lazy(() => import('./modules/avs-self-service/AvsSelfServicePage.jsx'))
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
const SessionsPage = lazy(() => import('./modules/admin/SessionsPage.jsx'))
const ProjectsPage = lazy(() => import('./modules/admin/ProjectsPage.jsx'))
const KioskDevicesPage = lazy(() => import('./modules/admin/KioskDevicesPage.jsx'))
const KioskEnrollmentPage = lazy(() => import('./modules/kiosk-enrollment/KioskEnrollmentPage.jsx'))
const NotificationPrefsPage = lazy(() => import('./modules/notification-prefs/NotificationPrefsPage.jsx'))
const NotificationsCenterPage = lazy(() => import('./modules/notifications/NotificationsCenterPage.jsx'))
const KvkkPage = lazy(() => import('./modules/kvkk/KvkkPage.jsx'))

function PrivateRoute({ children }) {
  const user = useAuthStore(s => s.user)
  return user ? children : <Navigate to="/login" />
}

// Ayarlar rotalarinin korumasi menuyle AYNI kaynaktan gelir. Ikisi ayri
// yerlerde tutuldugunda ayrismisti: 2 sayfa menude gizliyken URL'den aciliyor
// (sonra her istek 403), 1 sayfa menude gorunup tiklaninca ana sayfaya atiyordu.
function SettingsRoute({ settingsKey, children }) {
  const user = useAuthStore(s => s.user)
  if (!canAccess(settingsKey, user?.role)) return <Navigate to="/settings" replace />
  return children
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

// Sayfa yenilemede httpOnly cookie ile oturumu geri yükler.
// Cookie geçerliyse /me → user restore, geçersizse sessizce devam (login sayfası açılır).
function AuthRestorer({ children }) {
  const restoreUser = useAuthStore(s => s.restoreUser)
  const user = useAuthStore(s => s.user)
  const [ready, setReady] = useState(!!user)

  useEffect(() => {
    if (user) { setReady(true); return }
    api.get('/auth/me')
      .then(r => { restoreUser(r.data.user) })
      .catch(() => { /* cookie yok/geçersiz — login sayfası bekliyor */ })
      .finally(() => setReady(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><span className="page-spinner" /></div>
  }
  return children
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
  const onPublic = publicPaths.includes(location.pathname) || location.pathname.startsWith('/driver/trips/')
  if (data?.needs_setup && !onPublic) return <Navigate to="/setup" replace />
  if (!data?.needs_setup && onSetup) return <Navigate to="/login" replace />
  return children
}

function StagingBanner() {
  if (typeof window === 'undefined') return null
  if (!window.location.hostname.startsWith('staging.')) return null
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: '#FFC107',
      color: '#000',
      textAlign: 'center',
      fontWeight: 600,
      padding: '4px 8px',
      zIndex: 9999,
      fontSize: '13px',
      borderBottom: '2px solid #FF6F00',
      letterSpacing: '0.5px',
    }}>
      STAGING ORTAMI — test verileri, prod'a yansımaz
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <StagingBanner />
      <ToastContainer />
      <ConfirmDialog />
      <InputDialog />
      <PwaInstallPrompt />
      <KioskDeviceAgent />
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><span className="page-spinner" /></div>}>
        <AuthRestorer>
        <SetupGate>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kvkk" element={<KvkkPage />} />
          <Route path="/driver/trips/:token" element={<DriverTripPage />} />
          <Route path="/kiosk" element={<SelfServicePage />} />
          <Route path="/laundry-kiosk" element={<LaundryKioskPage />} />
          <Route path="/avs-kiosk" element={<AvsSelfServicePage />} />
          <Route path="/display" element={<DisplayPage />} />
          <Route path="/display/kitchen" element={<KitchenDisplayPage />} />
          <Route path="/station" element={<StationPage />} />
          <Route path="/kiosk-enroll" element={<KioskEnrollmentPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="campus-map" element={<CampusMapPage />} />
            <Route path="checkin" element={<CheckinPage />} />
            <Route path="capacity" element={<CapacityPage />} />
            <Route path="housekeeping" element={<HousekeepingPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="room-history" element={<RoomHistoryPage />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="shifts" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><ShiftsPage /></RoleRoute>} />
            <Route path="shifts/personnel/:staffId" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><StaffDossierPage /></RoleRoute>} />
            <Route path="water" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><WaterPage /></RoleRoute>} />
            <Route path="reports-advanced" element={<AdvancedReportsPage />} />
            <Route path="integrity" element={<IntegrityPage />} />
            <Route path="personnel/:id" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><StaffDossierPage /></RoleRoute>} />
            <Route path="personnel/:id/legacy" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><Personnel360Page /></RoleRoute>} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="bulk-actions" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><BulkActionsPage /></RoleRoute>} />
            {/* Eski direkt yollar Ayarlar altina yonlendirilir (klavye kisayolu / eski bookmark geri uyum) */}
            <Route path="companies" element={<Navigate to="/settings/companies" replace />} />
            <Route path="visitors" element={<Navigate to="/settings/visitors" replace />} />
            <Route path="surveys" element={<Navigate to="/settings/surveys" replace />} />
            <Route path="drills" element={<Navigate to="/settings/drills" replace />} />
            <Route path="documents" element={<Navigate to="/settings/documents" replace />} />
            <Route path="expenses" element={<Navigate to="/settings/expenses" replace />} />
            <Route path="notification-groups" element={<Navigate to="/settings/notification-groups" replace />} />
            <Route path="automation" element={<Navigate to="/settings/automation" replace />} />
            {/* Operasyon modulleri Ayarlar altina tasindi — eski path'ler redirect */}
            <Route path="personnel" element={<Navigate to="/settings/personnel" replace />} />
            <Route path="risk" element={<Navigate to="/settings/risk" replace />} />
            <Route path="hr" element={<Navigate to="/settings/hr" replace />} />
            <Route path="safety" element={<Navigate to="/settings/safety" replace />} />
            <Route path="discipline" element={<Navigate to="/settings/discipline" replace />} />
            <Route path="performance" element={<Navigate to="/settings/performance" replace />} />
            <Route path="meals" element={<Navigate to="/settings/meals" replace />} />
            <Route path="transport" element={<TransportPage />} />
            <Route path="comms" element={<Navigate to="/settings/comms" replace />} />
            <Route path="payroll" element={<Navigate to="/settings/payroll" replace />} />
            <Route path="combined-absences" element={<Navigate to="/settings/combined-absences" replace />} />
            <Route path="holidays" element={<Navigate to="/settings/holidays" replace />} />
            <Route path="archived-personnel" element={<Navigate to="/settings/archived-personnel" replace />} />
            <Route path="laundry" element={<LaundryHub />} />
            <Route path="laundry/*" element={<LaundryHub />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<RoleRoute roles={['campus_manager']}><AuditPage /></RoleRoute>} />
            <Route path="error-log" element={<RoleRoute roles={['campus_manager']}><ErrorLogPage /></RoleRoute>} />
            <Route path="backup" element={<RoleRoute roles={['campus_manager']}><BackupPage /></RoleRoute>} />
            <Route path="kvkk-admin" element={<RoleRoute roles={['campus_manager']}><KvkkAdminPage /></RoleRoute>} />
            <Route path="system" element={<RoleRoute roles={['campus_manager']}><SystemHealthPage /></RoleRoute>} />
            <Route path="sessions" element={<RoleRoute roles={['campus_manager']}><SessionsPage /></RoleRoute>} />
            <Route path="projects" element={<RoleRoute roles={['campus_manager']}><ProjectsPage /></RoleRoute>} />
            <Route path="notifications" element={<NotificationsCenterPage />} />
            <Route path="notifications/preferences" element={<NotificationPrefsPage />} />
            <Route path="users" element={<RoleRoute roles={['campus_manager']}><UsersPage /></RoleRoute>} />
            <Route path="kiosk-pins" element={<RoleRoute roles={['campus_manager']}><KioskPinPage /></RoleRoute>} />
            <Route path="kiosk-devices" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><KioskDevicesPage /></RoleRoute>} />
            <Route path="announcements" element={<RoleRoute roles={['campus_manager']}><AnnouncementsPage /></RoleRoute>} />
            <Route path="avs-workers" element={<RoleRoute roles={['campus_manager']}><AvsWorkersPage /></RoleRoute>} />
            <Route path="cards" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><CardsPage /></RoleRoute>} />
            <Route path="stations" element={<RoleRoute roles={['campus_manager']}><StationsPage /></RoleRoute>} />
            <Route path="presence" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><PresencePage /></RoleRoute>} />
            <Route path="settings" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><SettingsLayout /></RoleRoute>}>
              <Route index element={<SettingsHomePage />} />
              <Route path="email" element={<SettingsRoute settingsKey="email"><SettingsPage /></SettingsRoute>} />
              <Route path="mail-compose" element={<SettingsRoute settingsKey="mail-compose"><MailComposePage /></SettingsRoute>} />
              <Route path="users" element={<SettingsRoute settingsKey="users"><UsersPage /></SettingsRoute>} />
              <Route path="kiosk-pins" element={<SettingsRoute settingsKey="kiosk-pins"><KioskPinPage /></SettingsRoute>} />
              <Route path="kiosk-devices" element={<SettingsRoute settingsKey="kiosk-devices"><KioskDevicesPage /></SettingsRoute>} />
              <Route path="announcements" element={<SettingsRoute settingsKey="announcements"><AnnouncementsPage /></SettingsRoute>} />
              <Route path="avs-workers" element={<SettingsRoute settingsKey="avs-workers"><AvsWorkersPage /></SettingsRoute>} />
              <Route path="cards" element={<SettingsRoute settingsKey="cards"><CardsPage /></SettingsRoute>} />
              <Route path="stations" element={<SettingsRoute settingsKey="stations"><StationsPage /></SettingsRoute>} />
              <Route path="audit" element={<SettingsRoute settingsKey="audit"><AuditPage /></SettingsRoute>} />
              <Route path="error-log" element={<SettingsRoute settingsKey="error-log"><ErrorLogPage /></SettingsRoute>} />
              <Route path="backup" element={<SettingsRoute settingsKey="backup"><BackupPage /></SettingsRoute>} />
              <Route path="kvkk-admin" element={<SettingsRoute settingsKey="kvkk-admin"><KvkkAdminPage /></SettingsRoute>} />
              <Route path="system" element={<SettingsRoute settingsKey="system"><SystemHealthPage /></SettingsRoute>} />
              <Route path="sessions" element={<SettingsRoute settingsKey="sessions"><SessionsPage /></SettingsRoute>} />
              <Route path="projects" element={<SettingsRoute settingsKey="projects"><ProjectsPage /></SettingsRoute>} />
              {/* Yonetim modulleri sekmeler olarak */}
              <Route path="companies" element={<SettingsRoute settingsKey="companies"><CompaniesPage /></SettingsRoute>} />
              <Route path="visitors" element={<SettingsRoute settingsKey="visitors"><VisitorsPage /></SettingsRoute>} />
              <Route path="surveys" element={<SettingsRoute settingsKey="surveys"><SurveysPage /></SettingsRoute>} />
              <Route path="feedback" element={<SettingsRoute settingsKey="feedback"><FeedbackPage /></SettingsRoute>} />
              <Route path="drills" element={<SettingsRoute settingsKey="drills"><DrillsPage /></SettingsRoute>} />
              <Route path="documents" element={<SettingsRoute settingsKey="documents"><DocumentsPage /></SettingsRoute>} />
              <Route path="expenses" element={<SettingsRoute settingsKey="expenses"><ExpensesPage /></SettingsRoute>} />
              <Route path="notification-groups" element={<SettingsRoute settingsKey="notification-groups"><NotificationGroupsPage /></SettingsRoute>} />
              <Route path="automation" element={<SettingsRoute settingsKey="automation"><AutomationPage /></SettingsRoute>} />
              {/* Operasyondan tasinan modulleri */}
              <Route path="personnel" element={<SettingsRoute settingsKey="personnel"><PersonnelListPage /></SettingsRoute>} />
              <Route path="risk" element={<SettingsRoute settingsKey="risk"><RiskListPage /></SettingsRoute>} />
              <Route path="hr" element={<SettingsRoute settingsKey="hr"><HrPage /></SettingsRoute>} />
              <Route path="safety" element={<SettingsRoute settingsKey="safety"><SafetyPage /></SettingsRoute>} />
              <Route path="discipline" element={<SettingsRoute settingsKey="discipline"><DisciplinePage /></SettingsRoute>} />
              <Route path="performance" element={<SettingsRoute settingsKey="performance"><PerformancePage /></SettingsRoute>} />
              <Route path="meals" element={<SettingsRoute settingsKey="meals"><MealsPage /></SettingsRoute>} />
              <Route path="comms" element={<SettingsRoute settingsKey="comms"><CommsPage /></SettingsRoute>} />
              <Route path="payroll" element={<SettingsRoute settingsKey="payroll"><PayrollPage /></SettingsRoute>} />
              <Route path="combined-absences" element={<SettingsRoute settingsKey="combined-absences"><CombinedAbsencesPage /></SettingsRoute>} />
              <Route path="holidays" element={<SettingsRoute settingsKey="holidays"><HolidaysPage /></SettingsRoute>} />
              <Route path="archived-personnel" element={<SettingsRoute settingsKey="archived-personnel"><ArchivedPersonnelPage /></SettingsRoute>} />
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
        </AuthRestorer>
      </Suspense>
    </ErrorBoundary>
  )
}
