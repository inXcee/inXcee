import { lazy, startTransition, Suspense, useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import StaffDetailPanel from './StaffDetailPanel.jsx'

const ScheduleTab = lazy(() => import('./tabs/ScheduleTab.jsx'))
const StaffTab = lazy(() => import('./tabs/StaffTab.jsx'))
const LeaveTab = lazy(() => import('./tabs/LeaveTab.jsx'))
const OvertimeTab = lazy(() => import('./tabs/OvertimeTab.jsx'))
const PuantajTab = lazy(() => import('./tabs/PuantajTab.jsx'))
const SwapTab = lazy(() => import('./tabs/SwapTab.jsx'))
const DepartmentsTab = lazy(() => import('./tabs/DepartmentsTab.jsx'))
const DocumentsTab = lazy(() => import('./tabs/DocumentsTab.jsx'))
const SettingsTab = lazy(() => import('./tabs/SettingsTab.jsx'))
const PeriodReportTab = lazy(() => import('./tabs/PeriodReportTab.jsx'))

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN — ShiftsPage
// ═══════════════════════════════════════════════════════════════════════════════
// Günlük işin döndüğü beş sekme her zaman görünür; ayda bir açılanlar "Diğer" menüsünde durur.
// Sekme adları yazıyla görünür — yalnız ikonla gezinmek hangi sekmenin ne olduğunu ezberletiyordu.
const NAV_ITEMS = [
  { id: 'schedule',    label: 'Çizelge' },
  { id: 'staff',       label: 'Personel' },
  { id: 'leave',       label: 'İzinler' },
  { id: 'overtime',    label: 'Mesai' },
  { id: 'puantaj',     label: 'Puantaj' },
  { id: 'documents',   label: 'Belgeler', more: true },
  { id: 'swap',        label: 'Takas', more: true },
  { id: 'report',      label: 'Rapor', more: true },
  { id: 'departments', label: 'Bölümler', more: true },
  { id: 'settings',    label: 'Ayarlar', more: true },
]
const PRIMARY_TABS = NAV_ITEMS.filter(item => !item.more)
const MORE_TABS = NAV_ITEMS.filter(item => item.more)
const REFERENCE_STALE_TIME = 5 * 60 * 1000

function ShiftTabFallback({ label }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '240px',
        display: 'grid',
        placeItems: 'center',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        background: 'var(--surface)',
        color: 'var(--text3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'var(--mono)', fontSize: '11px' }}>
        <span className="page-spinner" />
        {label || 'Vardiya ekranı'} yükleniyor…
      </div>
    </div>
  )
}

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useUrlParamState('tab', 'schedule')
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
    staleTime: REFERENCE_STALE_TIME,
  })

  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-defs'],
    queryFn: () => api.get('/shifts/definitions').then(r => r.data),
    staleTime: REFERENCE_STALE_TIME,
  })

  const { data: pendingLeaves = [] } = useQuery({
    queryKey: ['leaves', 'badge'],
    queryFn: () => api.get('/shifts/leave?status=pending').then(r => r.data),
    staleTime: 60000,
  })
  const pendingLeaveCount = pendingLeaves.length

  const handlePersonClick = useCallback((id) => {
    setSelectedStaff(id)
  }, [])
  const handleTabChange = useCallback((id) => {
    setMoreOpen(false)
    startTransition(() => setActiveTab(id))
  }, [setActiveTab])

  const activeNav = NAV_ITEMS.find(n => n.id === activeTab)

  const activeInMore = MORE_TABS.some(item => item.id === activeTab)

  return (
    <div className="fade-up" style={{ display: 'flex', height: 'calc(100vh - 64px)', margin: '-32px -40px', minHeight: 0, position: 'relative' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

        {/* Tek satır sekme çubuğu — başlık, alt başlık ve ikon şeridinin yerine */}
        <nav aria-label="Vardiya sekmeleri" style={tabBar}>
          <div role="tablist" style={{ display: 'flex', alignItems: 'stretch', gap: 4, minWidth: 0, overflowX: 'auto' }}>
            {PRIMARY_TABS.map(item => {
              const active = activeTab === item.id
              const badge = item.id === 'leave' ? pendingLeaveCount : 0
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={item.label}
                  onClick={() => handleTabChange(item.id)}
                  style={active ? tabActive : tabIdle}
                >
                  {item.label}
                  {badge > 0 && <span style={tabBadge} aria-label={`${badge} bekleyen`}>{badge}</span>}
                </button>
              )
            })}
          </div>

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(open => !open)}
              style={activeInMore ? tabActive : tabIdle}
            >
              {activeInMore ? activeNav.label : 'Diğer'} ▾
            </button>
            {moreOpen && (
              <>
                <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div role="menu" style={moreMenu}>
                  {MORE_TABS.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      title={item.label}
                      onClick={() => handleTabChange(item.id)}
                      style={{ ...moreItem, color: activeTab === item.id ? 'var(--accent)' : 'var(--text)', fontWeight: activeTab === item.id ? 600 : 400 }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><HelpHint topic="shifts" title="VARDİYA YÖNETİMİ" /></span>
        </nav>

        {/* Content area — asıl kaydırıcı; minHeight:0 sayesinde flex içinde daralıp
            iç kaydırma yapar (sticky sürükle paleti + sticky üst bar bu sayede çalışır) */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px 28px' }}>
          <Suspense fallback={<ShiftTabFallback label={activeNav?.label} />}>
            {activeTab === 'schedule'    && <ScheduleTab departments={departments} shiftDefs={shiftDefs} onPersonClick={handlePersonClick} />}
            {activeTab === 'staff'       && <StaffTab departments={departments} onPersonClick={handlePersonClick} />}
            {activeTab === 'leave'       && <LeaveTab departments={departments} onPersonClick={handlePersonClick} />}
            {activeTab === 'overtime'    && <OvertimeTab departments={departments} onPersonClick={handlePersonClick} />}
            {activeTab === 'puantaj'     && <PuantajTab departments={departments} shiftDefs={shiftDefs} onPersonClick={handlePersonClick} />}
            {activeTab === 'documents'   && <DocumentsTab departments={departments} />}
            {activeTab === 'report'      && <PeriodReportTab departments={departments} />}
            {activeTab === 'departments' && <DepartmentsTab />}
            {activeTab === 'swap'        && <SwapTab />}
            {activeTab === 'settings'    && <SettingsTab departments={departments} shiftDefs={shiftDefs} />}
          </Suspense>
        </div>
      </div>

      {/* Staff detail side panel */}
      {selectedStaff && (
        <StaffDetailPanel staffId={selectedStaff} departments={departments} onClose={() => setSelectedStaff(null)} />
      )}
    </div>
  )
}

const tabBar = {
  display: 'flex', alignItems: 'stretch', gap: 4, flexShrink: 0,
  padding: '0 28px', minHeight: 48, borderBottom: '1px solid var(--border)', background: 'var(--bg)',
}
const tabIdle = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 14px', whiteSpace: 'nowrap',
  background: 'none', borderWidth: 0, borderBottomWidth: 2, borderStyle: 'solid', borderColor: 'transparent',
  color: 'var(--text2)', fontSize: 14, cursor: 'pointer', minHeight: 48,
}
const tabActive = { ...tabIdle, color: 'var(--text)', fontWeight: 600, borderColor: 'var(--accent)' }
const tabBadge = {
  background: 'var(--red)', color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 600,
}
const moreMenu = {
  position: 'absolute', top: '100%', left: 0, zIndex: 41, minWidth: 180, padding: 6,
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
  boxShadow: '0 8px 28px rgba(0,0,0,.28)', display: 'grid',
}
const moreItem = {
  textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderRadius: 6,
  fontSize: 14, cursor: 'pointer',
}
