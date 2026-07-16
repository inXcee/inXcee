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
const SettingsTab = lazy(() => import('./tabs/SettingsTab.jsx'))

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN — ShiftsPage
// ═══════════════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id: 'schedule',    icon: '📅', label: 'Çizelge' },
  { id: 'staff',       icon: '👥', label: 'Personel' },
  { id: 'leave',       icon: '🏖️', label: 'İzinler' },
  { id: 'overtime',    icon: '⏰', label: 'Mesai' },
  { id: 'puantaj',     icon: '📊', label: 'Puantaj' },
  { id: 'swap',        icon: '🔁', label: 'Takas' },
  { id: 'departments', icon: '🏢', label: 'Bölümler' },
  { id: 'settings',    icon: '⚙️', label: 'Ayarlar' },
]
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
  const [navExpanded, setNavExpanded] = useState(false)

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
    startTransition(() => setActiveTab(id))
  }, [setActiveTab])

  const activeNav = NAV_ITEMS.find(n => n.id === activeTab)

  return (
    <div className="fade-up" style={{ display: 'flex', height: '100%', margin: '-32px -40px', minHeight: 'calc(100vh - 60px)', position: 'relative' }}>

      {/* ── Left navigation sidebar ── */}
      <nav style={{
        width: navExpanded ? '180px' : '64px',
        flexShrink: 0,
        background: 'linear-gradient(180deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 95%, var(--accent)) 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .2s ease',
        overflow: 'hidden',
        zIndex: 20,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
      }}>
        {/* Logo / toggle */}
        <button
          onClick={() => setNavExpanded(p => !p)}
          style={{
            padding: '18px 0', width: '100%',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: navExpanded ? 'flex-start' : 'center',
            paddingLeft: navExpanded ? '20px' : 0,
            borderBottom: '1px solid var(--border)',
            gap: '10px',
          }}
          title="Menüyü genişlet"
        >
          <span style={{ fontSize: '20px', flexShrink: 0 }}>⚡</span>
          {navExpanded && (
            <span style={{ fontFamily: 'var(--display)', fontSize: '11px', letterSpacing: '2px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
              VARDİYA
            </span>
          )}
        </button>

        {/* Nav items */}
        <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const active = activeTab === item.id
            const badge = item.id === 'leave' && pendingLeaveCount > 0 ? pendingLeaveCount : 0
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                style={{
                  width: '100%', padding: '12px 0',
                  paddingLeft: navExpanded ? '16px' : 0,
                  background: active ? 'rgba(240,165,0,.18)' : 'none',
                  border: 'none',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(240,165,0,.3)' : 'none',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: navExpanded ? 'flex-start' : 'center',
                  gap: '10px',
                  transition: 'all .15s',
                  position: 'relative',
                }}
                title={item.label}
              >
                {/* İkon + collapsed badge (küçük nokta) */}
                <span style={{ fontSize: '18px', flexShrink: 0, filter: active ? 'drop-shadow(0 0 6px var(--accent))' : 'none', position: 'relative' }}>
                  {item.icon}
                  {badge > 0 && !navExpanded && (
                    <span style={{
                      position: 'absolute', top: '-2px', right: '-4px',
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: 'var(--red)', border: '1px solid var(--bg)',
                    }} />
                  )}
                </span>
                {navExpanded && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
                    color: active ? 'var(--accent)' : 'var(--text2)',
                    fontWeight: active ? 700 : 400,
                    whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {item.label.toUpperCase()}
                  </span>
                )}
                {/* Genişletilmiş badge (sayı) */}
                {badge > 0 && navExpanded && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                    background: 'var(--red)', color: '#fff',
                    borderRadius: '999px', padding: '1px 5px',
                    marginRight: '8px', flexShrink: 0,
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px' }}>
            {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })}
          </div>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sticky top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: 'color-mix(in srgb, var(--bg) 80%, transparent)',
          backdropFilter: 'blur(12px)',
          borderBottom: '2px solid var(--accent)',
          padding: '0 28px',
          display: 'flex', alignItems: 'center', gap: '12px',
          minHeight: '56px',
          boxShadow: '0 1px 0 var(--border), 0 4px 16px rgba(0,0,0,.15)',
        }}>
          <span style={{ fontSize: '22px' }}>{activeNav?.icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '3px', color: 'var(--text)' }}>
              {activeNav?.label?.toUpperCase() || 'VARDİYA'}<HelpHint topic="shifts" title="VARDİYA YÖNETİMİ" />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '1px' }}>
              VARDİYA YÖNETİM SİSTEMİ
            </div>
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <Suspense fallback={<ShiftTabFallback label={activeNav?.label} />}>
            {activeTab === 'schedule'    && <ScheduleTab departments={departments} shiftDefs={shiftDefs} onPersonClick={handlePersonClick} />}
            {activeTab === 'staff'       && <StaffTab departments={departments} onPersonClick={handlePersonClick} />}
            {activeTab === 'leave'       && <LeaveTab departments={departments} onPersonClick={handlePersonClick} />}
            {activeTab === 'overtime'    && <OvertimeTab departments={departments} onPersonClick={handlePersonClick} />}
            {activeTab === 'puantaj'     && <PuantajTab departments={departments} shiftDefs={shiftDefs} onPersonClick={handlePersonClick} />}
            {activeTab === 'departments' && <DepartmentsTab />}
            {activeTab === 'swap'        && <SwapTab />}
            {activeTab === 'settings'    && <SettingsTab departments={departments} shiftDefs={shiftDefs} />}
          </Suspense>
        </div>
      </div>

      {/* Staff detail side panel */}
      {selectedStaff && (
        <StaffDetailPanel staffId={selectedStaff} onClose={() => setSelectedStaff(null)} />
      )}
    </div>
  )
}
