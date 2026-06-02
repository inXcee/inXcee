import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { todayStr } from './shared.jsx'
import ReportsTab from './tabs/ReportsTab.jsx'
import PointsTab from './tabs/PointsTab.jsx'
import RoutesTab from './tabs/RoutesTab.jsx'
import PeopleTab from './tabs/PeopleTab.jsx'
import DailyTab from './tabs/DailyTab.jsx'

const TABS = [
  { key: 'daily', label: 'BUGÜN', icon: '🚌' },
  { key: 'routes', label: 'ROTALAR', icon: '🛣' },
  { key: 'points', label: 'DURAKLAR', icon: '📍' },
  { key: 'people', label: 'PERSONEL', icon: '👥' },
  { key: 'reports', label: 'RAPORLAR', icon: '📊' },
]

export default function TransportPage() {
  const [tab, setTab] = useUrlParamState('tab', 'daily')
  const [date, setDate] = useState(todayStr())
  const [searchOpen, setSearchOpen] = useState(false)

  // Klavye kısayolları
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target.tagName
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.target.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); setSearchOpen(true) }
      else if (e.key === '1') setTab('daily')
      else if (e.key === '2') setTab('routes')
      else if (e.key === '3') setTab('points')
      else if (e.key === '4') setTab('people')
      else if (e.key === '5') setTab('reports')
      else if (e.key === 'h') setDate(todayStr())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200 }} className="fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 30, letterSpacing: 5, color: 'var(--text)', margin: 0 }}>SERVİSLER<HelpHint topic="transport" title="SERVİSLER" /></h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 5, letterSpacing: 1.5 }}>
            ULAŞIM ROTALARI · DURAKLAR · GÜNLÜK ATAMA
          </p>
        </div>
        {tab === 'daily' && (
          <input type="date" className="form-input" value={date}
            onChange={e => setDate(e.target.value)}
            style={{ width: 'auto', fontSize: 12, borderRadius: 10 }} />
        )}
      </div>

      <div style={{
        display: 'flex', gap: 2, marginBottom: 16,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 4,
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 14px', border: 'none', borderRadius: 10,
            background: tab === t.key ? 'var(--accent)' : 'transparent',
            color: tab === t.key ? '#000' : 'var(--text3)',
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1.5,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 13 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily' && <DailyTab date={date} />}
      {tab === 'routes' && <RoutesTab />}
      {tab === 'points' && <PointsTab />}
      {tab === 'people' && <PeopleTab />}
      {tab === 'reports' && <ReportsTab />}

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} setTab={setTab} />}
    </div>
  )
}

// Global arama: / tuşu açar, durak + rota + personel ara
function GlobalSearch({ onClose, setTab }) {
  const [q, setQ] = useState('')
  const { data: points = [] } = useQuery({ queryKey: ['transport-points'], queryFn: () => api.get('/transport/pickup-points').then(r => r.data) })
  const { data: routes = [] } = useQuery({ queryKey: ['transport-routes'], queryFn: () => api.get('/transport/routes').then(r => r.data) })
  const { data: staff = [] } = useQuery({ queryKey: ['transport-staff', 'all'], queryFn: () => api.get('/transport/staff').then(r => r.data) })

  const results = useMemo(() => {
    if (q.length < 1) return []
    const low = q.toLowerCase()
    const out = []
    points.filter(p => `${p.name} ${p.district || ''} ${p.neighborhood || ''}`.toLowerCase().includes(low)).slice(0, 5)
      .forEach(p => out.push({ type: 'point', icon: '📍', label: p.name, sub: p.district || '—', target: 'points' }))
    routes.filter(r => `${r.name} ${r.vehicle_plate || ''} ${r.driver_name || ''}`.toLowerCase().includes(low)).slice(0, 5)
      .forEach(r => out.push({ type: 'route', icon: '🛣', label: r.name, sub: `${r.vehicle_plate || '—'} · ${r.capacity} kişi`, target: 'routes' }))
    staff.filter(s => `${s.full_name} ${s.role_label || ''} ${s.dept_name || ''} ${s.pickup_name || ''}`.toLowerCase().includes(low)).slice(0, 10)
      .forEach(s => out.push({ type: 'staff', icon: '👤', label: s.full_name, sub: `${s.dept_name || '—'}${s.pickup_name ? ' · 📍 ' + s.pickup_name : ' · durak yok'}`, target: 'people' }))
    return out
  }, [q, points, routes, staff])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 80 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 540, maxWidth: '95vw', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 48px rgba(0,0,0,.4)', overflow: 'hidden' }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="🔍 Durak, rota, personel ara…"
          style={{ width: '100%', padding: '14px 18px', fontSize: 15, border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', borderBottom: '1px solid var(--border)' }} />
        {q.length < 1 ? (
          <div style={{ padding: 18, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
            💡 Kısayollar: <kbd style={{ padding: '1px 5px', background: 'var(--surface2)', borderRadius: 3 }}>1-5</kbd> sekme · <kbd style={{ padding: '1px 5px', background: 'var(--surface2)', borderRadius: 3 }}>h</kbd> bugüne dön · <kbd style={{ padding: '1px 5px', background: 'var(--surface2)', borderRadius: 3 }}>Esc</kbd> kapat
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Sonuç bulunamadı</div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} onClick={() => { setTab(r.target); onClose() }}
                style={{ padding: '10px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 16 }}>{r.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.label}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.sub}</div>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase' }}>{r.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


