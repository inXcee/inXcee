import { useState, useMemo, useRef, useEffect, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable, SkeletonBlock } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import {
  todayStr, toast, toastErr,
  KPI, Section, BarList, Stat, Empty, ModalShell, Label, ModalActions, EmptyState,
} from './shared.jsx'
import ReportsTab from './tabs/ReportsTab.jsx'
import PointsTab from './tabs/PointsTab.jsx'

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

// ─────────────────────────────────────────────────────────────────────────────
// BUGÜN — Daily Dashboard
// ─────────────────────────────────────────────────────────────────────────────
function DailyTab({ date }) {
  const qc = useQueryClient()
  const [openRouteId, setOpenRouteId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['transport-daily', date],
    queryFn: () => api.get(`/transport/daily?date=${date}`).then(r => r.data),
  })

  const autoMut = useMutation({
    mutationFn: (override) => api.post('/transport/auto-assign', { date, override }),
    onSuccess: (r) => {
      toast(`${r.data.assigned} atama yapıldı`)
      qc.invalidateQueries({ queryKey: ['transport-daily'] })
      qc.invalidateQueries({ queryKey: ['manifest'] })
    },
    onError: toastErr,
  })

  if (isLoading) return <SkeletonTable rows={5} cols={5} />
  if (!data) return null

  const coverage = data.on_shift_count > 0 ? Math.round(data.assigned_count / data.on_shift_count * 100) : 0

  return (
    <div>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
        <KPI label="VARDİYADA" value={data.on_shift_count} color="var(--accent)" />
        <KPI label="SERVİSE ATANMIŞ" value={data.assigned_count} color="var(--green)" sub={`%${coverage} kapsama`} />
        <KPI label="ATANMAMIŞ" value={data.uncovered_count} color={data.uncovered_count > 0 ? 'var(--red)' : 'var(--green)'} />
        <KPI label="UYARILAR" value={data.alerts.length} color={data.alerts.length > 0 ? 'var(--amber)' : 'var(--green)'} />
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => autoMut.mutate(false)} disabled={autoMut.isPending} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>
          {autoMut.isPending ? '...' : '⚡ OTOMATİK ATA (boşları)'}
        </button>
        <button onClick={async () => { if (await confirmDialog({ title: 'Tüm atamaları yeniden hesapla', body: 'Mevcut atamalar silinip yeniden yapılacak.', confirmLabel: 'Yap' })) autoMut.mutate(true) }}
          disabled={autoMut.isPending} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }}>
          🔄 HEPSİNİ YENİDEN HESAPLA
        </button>
        <button onClick={() => downloadAllPdf(date)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }} title="Tüm aktif rotaların manifestosu tek PDF">
          📄 TÜMÜ PDF
        </button>
      </div>

      {/* Uyarılar */}
      {data.alerts.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(240,165,0,.05)', border: '1px solid rgba(240,165,0,.25)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', letterSpacing: 1.5, marginBottom: 6 }}>UYARILAR</div>
          {data.alerts.map((a, i) => (
            <div key={i} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: a.type === 'over_capacity' || a.type === 'uncovered' ? 'var(--red)' : 'var(--amber)', marginTop: 2 }}>
              {a.type === 'over_capacity' ? '🔴' : a.type === 'uncovered' ? '⚠' : '🟡'} {a.message}
            </div>
          ))}
        </div>
      )}

      {/* Durak yoğunluğu — kim hangi duraktan geliyor özeti */}
      {data.pickup_distribution && data.pickup_distribution.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>📍 DURAK YOĞUNLUĞU (bugün vardiyada)</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{data.pickup_distribution.length} durak aktif</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
            {data.pickup_distribution.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)', minWidth: 24, textAlign: 'center' }}>
                  {p.staff_count}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  {p.district && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{p.district}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rotalar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
        {data.routes.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>🛣</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2, marginBottom: 6 }}>HENÜZ ROTA YOK</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>"Rotalar" sekmesinden ilk rotanı oluştur</div>
          </div>
        ) : data.routes.map(r => {
          const pct = r.capacity > 0 ? Math.min(100, Math.round(r.assigned_count / r.capacity * 100)) : 0
          const over = r.assigned_count > r.capacity
          return (
            <div key={r.id} onClick={() => setOpenRouteId(r.id)} style={{
              padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
              background: 'var(--surface)', borderLeft: `4px solid ${r.color || 'var(--accent)'}`,
              border: '1px solid var(--border)', transition: 'transform 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                    {r.vehicle_plate || '— —'} {r.shift_name ? `· ${r.shift_name}` : ''}
                  </div>
                </div>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                  color: over ? 'var(--red)' : pct > 80 ? 'var(--amber)' : 'var(--green)',
                }}>{r.assigned_count}/{r.capacity}</span>
              </div>
              <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: over ? 'var(--red)' : pct > 80 ? 'var(--amber)' : 'var(--green)', transition: 'width .3s' }} />
              </div>
              {(r.boarded_count > 0 || r.no_show_count > 0 || r.waitlist_count > 0) && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, marginTop: 6, display: 'flex', gap: 8 }}>
                  {r.boarded_count > 0 && <span style={{ color: 'var(--green)' }}>✓{r.boarded_count}</span>}
                  {r.no_show_count > 0 && <span style={{ color: 'var(--red)' }}>✗{r.no_show_count}</span>}
                  {r.waitlist_count > 0 && <span style={{ color: 'var(--amber)' }}>⏳{r.waitlist_count}</span>}
                </div>
              )}
              {r.driver_name && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 6 }}>🧑‍✈️ {r.driver_name}</div>}
            </div>
          )
        })}
      </div>

      {/* Atanmamış */}
      {data.uncovered.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(231,76,60,.2)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'var(--red)' }} />
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2 }}>SERVİSSİZ PERSONEL ({data.uncovered.length})</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>
              Vardiyada ama servise atanmamış kişiler
            </div>
          </div>
          <div style={{ padding: 8 }}>
            {data.uncovered.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {p.dept_name || '—'} · {p.role_label || '—'}
                    {p.pickup_name ? ` · 📍 ${p.pickup_name}` : ' · ⚠ durak atanmamış'}
                  </div>
                </div>
                <ManualAssignButton staffId={p.id} date={date} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manifest drawer */}
      {openRouteId && <ManifestDrawer routeId={openRouteId} date={date} onClose={() => setOpenRouteId(null)} />}
    </div>
  )
}

function ManualAssignButton({ staffId, date }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [routeId, setRouteId] = useState('')
  const { data: routes = [] } = useQuery({
    queryKey: ['transport-routes-active'],
    queryFn: () => api.get('/transport/routes?active=1').then(r => r.data),
    enabled: open,
  })
  const mut = useMutation({
    mutationFn: () => api.post('/transport/assign', { staff_id: staffId, route_id: +routeId, work_date: date }),
    onSuccess: () => { toast('Atandı'); qc.invalidateQueries({ queryKey: ['transport-daily'] }); setOpen(false) },
    onError: toastErr,
  })

  if (!open) return (
    <button onClick={() => setOpen(true)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>+ ATA</button>
  )
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <select className="form-select" value={routeId} onChange={e => setRouteId(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, width: 'auto' }}>
        <option value="">Rota seç</option>
        {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <button onClick={() => mut.mutate()} disabled={!routeId || mut.isPending} className="btn btn-primary btn-xs" style={{ borderRadius: 6 }}>✓</button>
      <button onClick={() => setOpen(false)} className="btn btn-ghost btn-xs" style={{ borderRadius: 6 }}>✕</button>
    </div>
  )
}

async function downloadPdf(routeId, date) {
  try {
    const res = await api.get(`/transport/routes/${routeId}/manifest/pdf?date=${date}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `manifest-${routeId}-${date}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) { toastErr(e) }
}

async function downloadAllPdf(date) {
  try {
    const res = await api.get(`/transport/manifest/all/pdf?date=${date}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `manifest-all-${date}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) { toastErr(e) }
}

function sendWhatsapp(data, date) {
  if (!data) return
  const lines = [
    `🚌 *${data.route.name}* — ${date}`,
    `🚐 Plaka: ${data.route.vehicle_plate || '—'}`,
    `👥 Toplam: ${data.total_passengers}/${data.route.capacity} kişi`,
    '',
  ]
  data.stops.forEach((s, i) => {
    if (s.passengers.length === 0) return
    lines.push(`*${i + 1}. ${s.scheduled_time ? `[${s.scheduled_time}] ` : ''}📍 ${s.point_name}*`)
    s.passengers.forEach((p, idx) => {
      lines.push(`   ${idx + 1}. ${p.full_name}${p.phone ? ` — ${p.phone}` : ''}`)
    })
    lines.push('')
  })
  lines.push('🏭 Filyos Doğal Gaz İşleme Tesisi')
  const text = encodeURIComponent(lines.join('\n'))
  const phone = (data.route.driver_phone || '').replace(/\D/g, '')
  const url = phone ? `https://wa.me/${phone.startsWith('0') ? '90' + phone.slice(1) : phone}?text=${text}`
    : `https://wa.me/?text=${text}`
  window.open(url, '_blank')
}

function ManifestDrawer({ routeId, date, onClose }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['manifest', routeId, date],
    queryFn: () => api.get(`/transport/routes/${routeId}/manifest?date=${date}`).then(r => r.data),
  })

  const boardMut = useMutation({
    mutationFn: ({ id, boarded }) => api.patch(`/transport/assignments/${id}/boarded`, { boarded }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manifest', routeId, date] })
      qc.invalidateQueries({ queryKey: ['transport-daily'] })
    },
    onError: toastErr,
  })
  const promoteMut = useMutation({
    mutationFn: (id) => api.post(`/transport/assignments/${id}/promote`),
    onSuccess: () => {
      toast('Yedek aktife alındı')
      qc.invalidateQueries({ queryKey: ['manifest', routeId, date] })
      qc.invalidateQueries({ queryKey: ['transport-daily'] })
    },
    onError: toastErr,
  })

  const cycleBoarded = (p) => {
    // null → true → false → null
    const next = p.boarded === null || p.boarded === undefined ? true : p.boarded === 1 ? false : null
    boardMut.mutate({ id: p.assignment_id, boarded: next })
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, height: '100%', overflowY: 'auto',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 20, boxShadow: '-8px 0 32px rgba(0,0,0,.4)',
      }}>
        {isLoading || !data ? (
          <SkeletonTable rows={4} cols={4} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, color: data.route.color || 'var(--accent)' }}>
                  🛣 {data.route.name}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1 }}>
                  {data.route.vehicle_plate || '—'} · {data.total_passengers}/{data.route.capacity} kişi · {date}
                </div>
                {(data.boarded_count > 0 || data.no_show_count > 0 || data.waitlist_count > 0) && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, marginTop: 4, display: 'flex', gap: 10 }}>
                    {data.boarded_count > 0 && <span style={{ color: 'var(--green)' }}>✓ {data.boarded_count} bindi</span>}
                    {data.no_show_count > 0 && <span style={{ color: 'var(--red)' }}>✗ {data.no_show_count} binmedi</span>}
                    {data.waitlist_count > 0 && <span style={{ color: 'var(--amber)' }}>⏳ {data.waitlist_count} yedek</span>}
                  </div>
                )}
                {data.route.driver_name && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    🧑‍✈️ {data.route.driver_name} {data.route.driver_phone ? `· ${data.route.driver_phone}` : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => downloadPdf(routeId, date)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }} title="PDF indir">📄 PDF</button>
                <button onClick={() => sendWhatsapp(data, date)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8, color: '#25D366' }} title="WhatsApp ile gönder">📱 WA</button>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
              </div>
            </div>

            {data.stops.map(s => (
              <div key={s.stop_id || 'unassigned'} style={{
                marginBottom: 12, padding: '10px 12px', borderRadius: 10,
                background: 'var(--surface2)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {s.scheduled_time && <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', marginRight: 8 }}>{s.scheduled_time}</span>}
                    📍 {s.point_name}
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                    {s.passengers.length} kişi
                  </span>
                </div>
                {s.district && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginBottom: 6 }}>{s.district} {s.neighborhood ? `· ${s.neighborhood}` : ''}</div>}
                {s.passengers.length === 0 && (!s.waitlist || s.waitlist.length === 0) ? (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text4)' }}>Boş durak</div>
                ) : (
                  <div>
                    {s.passengers.map(p => {
                      const mark = p.boarded === 1 ? '✓' : p.boarded === 0 ? '✗' : '○'
                      const color = p.boarded === 1 ? 'var(--green)' : p.boarded === 0 ? 'var(--red)' : 'var(--text3)'
                      return (
                        <div key={p.assignment_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0' }}>
                          <button onClick={() => cycleBoarded(p)} disabled={boardMut.isPending}
                            title="Tıklayarak işaretle: ✓ bindi / ✗ binmedi / ○ işaretsiz"
                            style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${color}`, background: 'transparent', color, cursor: 'pointer', fontWeight: 700 }}>
                            {mark}
                          </button>
                          <span style={{ flex: 1 }}>{p.full_name}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{p.dept_name || p.role_label || ''}</span>
                        </div>
                      )
                    })}
                    {s.waitlist && s.waitlist.length > 0 && (
                      <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 8, background: 'rgba(240,165,0,.08)', border: '1px dashed rgba(240,165,0,.35)' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', letterSpacing: 1.5, marginBottom: 4 }}>⏳ YEDEK ({s.waitlist.length})</div>
                        {s.waitlist.map(p => (
                          <div key={p.assignment_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 0' }}>
                            <button onClick={() => promoteMut.mutate(p.assignment_id)} disabled={promoteMut.isPending}
                              title="Aktife terfi et"
                              className="btn btn-ghost btn-xs" style={{ borderRadius: 6, fontSize: 9, padding: '1px 5px' }}>↑</button>
                            <span style={{ flex: 1 }}>{p.full_name}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{p.dept_name || ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTALAR
// ─────────────────────────────────────────────────────────────────────────────
function RoutesTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [stopsOpen, setStopsOpen] = useState(null)
  const today = todayStr()

  const { data: routes = [] } = useQuery({
    queryKey: ['transport-routes-rich', today],
    queryFn: () => api.get(`/transport/routes?with_stops=1&work_date=${today}`).then(r => r.data),
  })
  const { data: shiftDefs = [] } = useQuery({ queryKey: ['shift-defs'], queryFn: () => api.get('/shifts/definitions').then(r => r.data) })

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['transport-routes-rich'] })
    qc.invalidateQueries({ queryKey: ['transport-routes'] })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{routes.length} ROTA · {today}</div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ ROTA</button>
      </div>

      {routes.length === 0 ? (
        <EmptyState icon="🛣" title="HENÜZ ROTA YOK" desc="İlk rotayı oluştur" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {routes.map(r => {
            const pct = r.capacity > 0 ? Math.min(100, Math.round((r.today_assigned || 0) / r.capacity * 100)) : 0
            const over = (r.today_assigned || 0) > r.capacity
            return (
              <div key={r.id} style={{
                borderRadius: 14, background: 'var(--surface)',
                border: '1px solid var(--border)', overflow: 'hidden',
                opacity: r.is_active ? 1 : 0.55,
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Renk şeridi */}
                <div style={{ height: 5, background: r.color || 'var(--accent)' }} />

                {/* Üst kısım: ad + plaka + kapasite */}
                <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        🚌 {r.name}
                        {!r.is_active && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'var(--surface3)', color: 'var(--text3)' }}>PASİF</span>}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {r.vehicle_plate || '— plakasız —'}
                        {r.shift_name && <span style={{ marginLeft: 6, color: r.shift_color || 'var(--text3)' }}>· ⏱ {r.shift_name}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1, color: over ? 'var(--red)' : pct > 80 ? 'var(--amber)' : 'var(--green)' }}>
                        {r.today_assigned || 0}<span style={{ fontSize: 14, color: 'var(--text3)' }}>/{r.capacity}</span>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginTop: 2 }}>BUGÜN</div>
                    </div>
                  </div>

                  {/* Doluluk bar */}
                  <div style={{ marginTop: 8, height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: over ? 'var(--red)' : pct > 80 ? 'var(--amber)' : 'var(--green)' }} />
                  </div>

                  {/* Şoför */}
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🧑‍✈️</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {r.driver_name ? (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{r.driver_name}</div>
                          {r.driver_phone && (
                            <a href={`tel:${r.driver_phone}`} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>
                              📞 {r.driver_phone}
                            </a>
                          )}
                        </>
                      ) : (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text4)', fontStyle: 'italic' }}>Şoför atanmamış</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Durak listesi */}
                <div style={{ padding: '10px 14px', flex: 1 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>📍 GÜZERGAH ({r.stops?.length || 0} durak)</span>
                    {r.today_waitlisted > 0 && <span style={{ color: 'var(--amber)' }}>⏳ {r.today_waitlisted} yedek</span>}
                  </div>
                  {!r.stops || r.stops.length === 0 ? (
                    <div style={{ padding: '14px 8px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text4)', marginBottom: 6 }}>Durak eklenmemiş</div>
                      <button onClick={() => setStopsOpen(r)} className="btn btn-ghost btn-xs" style={{ borderRadius: 6 }}>+ İLK DURAĞI EKLE</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {r.stops.map((s, i) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, fontSize: 11, background: i === 0 ? 'rgba(34,197,94,.06)' : 'transparent' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', minWidth: 16, textAlign: 'center', fontWeight: 700 }}>
                            {i + 1}
                          </span>
                          {s.scheduled_time && (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', minWidth: 38 }}>
                              {s.scheduled_time}
                            </span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.point_name}</div>
                            {s.district && (
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text4)' }}>
                                {s.district}{s.neighborhood ? ` · ${s.neighborhood}` : ''}
                              </div>
                            )}
                          </div>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }} title="Bu durakta atanmış personel">
                            👥 {s.staff_count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Alt aksiyonlar */}
                <div style={{ display: 'flex', gap: 4, padding: '8px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <button onClick={() => setStopsOpen(r)} className="btn btn-ghost btn-xs" style={{ borderRadius: 6, flex: 1 }}>+ DURAK EKLE/DÜZENLE</button>
                  <button onClick={() => setEditing(r)} className="btn btn-ghost btn-xs" style={{ borderRadius: 6 }}>⚙ DÜZENLE</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(creating || editing) && <RouteFormModal initial={editing} shiftDefs={shiftDefs} onClose={() => { setCreating(false); setEditing(null) }} onSaved={inv} />}
      {stopsOpen && <StopsModal route={stopsOpen} onClose={() => setStopsOpen(null)} />}
    </div>
  )
}

function RouteFormModal({ initial, shiftDefs, onClose, onSaved }) {
  const [name, setName] = useState(initial?.name || '')
  const [vehiclePlate, setVehiclePlate] = useState(initial?.vehicle_plate || '')
  const [capacity, setCapacity] = useState(initial?.capacity || 16)
  const [driverName, setDriverName] = useState(initial?.driver_name || '')
  const [driverPhone, setDriverPhone] = useState(initial?.driver_phone || '')
  const [shiftDefId, setShiftDefId] = useState(initial?.shift_def_id || '')
  const [color, setColor] = useState(initial?.color || '#3b82f6')
  const [isActive, setIsActive] = useState(initial?.is_active ?? 1)
  const COLORS = ['#3b82f6', '#9333ea', '#16a34a', '#dc2626', '#eab308', '#f97316', '#ec4899', '#06b6d4']

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        name, vehicle_plate: vehiclePlate, capacity: +capacity,
        driver_name: driverName, driver_phone: driverPhone,
        shift_def_id: shiftDefId || null, color, is_active: isActive,
      }
      return initial?.id ? api.put(`/transport/routes/${initial.id}`, body) : api.post('/transport/routes', body)
    },
    onSuccess: () => { onSaved(); onClose(); toast('Kaydedildi') },
    onError: toastErr,
  })

  return (
    <ModalShell onClose={onClose} title={initial?.id ? 'ROTA DÜZENLE' : 'YENİ ROTA'}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <Label>Rota Adı *</Label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Ör: Mavi Hat, Sahil Hat" style={{ borderRadius: 10 }} />
        </div>
        <div>
          <Label>Plaka</Label>
          <input className="form-input" value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} placeholder="34 ABC 1234" style={{ borderRadius: 10 }} />
        </div>
        <div>
          <Label>Kapasite</Label>
          <input className="form-input" type="number" min="1" value={capacity} onChange={e => setCapacity(e.target.value)} style={{ borderRadius: 10 }} />
        </div>
        <div>
          <Label>Şoför</Label>
          <input className="form-input" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Ad Soyad" style={{ borderRadius: 10 }} />
        </div>
        <div>
          <Label>Telefon</Label>
          <input className="form-input" value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="05xx…" style={{ borderRadius: 10 }} />
        </div>
        <div>
          <Label>Vardiya</Label>
          <select className="form-select" value={shiftDefId} onChange={e => setShiftDefId(e.target.value)} style={{ borderRadius: 10 }}>
            <option value="">Tümü</option>
            {shiftDefs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Renk</Label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} style={{
                width: 26, height: 26, borderRadius: 6, border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                background: c, cursor: 'pointer', outline: color === c ? `1px solid ${c}` : 'none',
              }} />
            ))}
          </div>
        </div>
        {initial?.id && (
          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!isActive} onChange={e => setIsActive(e.target.checked ? 1 : 0)} /> Aktif
          </label>
        )}
      </div>
      <ModalActions onClose={onClose} onSave={() => mut.mutate()} disabled={!name || mut.isPending} loading={mut.isPending} />
    </ModalShell>
  )
}

const RouteMap = lazy(() => import('./MapPicker.jsx').then(m => ({ default: m.RouteMap })))

function StopsModal({ route, onClose }) {
  const qc = useQueryClient()
  const { data: stops = [] } = useQuery({
    queryKey: ['route-stops', route.id],
    queryFn: () => api.get(`/transport/routes/${route.id}/stops`).then(r => r.data),
  })
  const { data: points = [] } = useQuery({
    queryKey: ['pickup-points-active'],
    queryFn: () => api.get('/transport/pickup-points?active=1').then(r => r.data),
  })
  const [adding, setAdding] = useState(false)
  const [pickupId, setPickupId] = useState('')
  const [time, setTime] = useState('')

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['route-stops', route.id] })
    qc.invalidateQueries({ queryKey: ['transport-routes'] })
    qc.invalidateQueries({ queryKey: ['transport-routes-rich'] })
  }

  const addMut = useMutation({
    mutationFn: () => api.post(`/transport/routes/${route.id}/stops`, { pickup_point_id: +pickupId, scheduled_time: time || null }),
    onSuccess: () => { inv(); setAdding(false); setPickupId(''); setTime(''); toast('Durak eklendi') },
    onError: toastErr,
  })
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/transport/stops/${id}`),
    onSuccess: () => { inv(); toast('Durak silindi') },
    onError: toastErr,
  })

  const usedIds = useMemo(() => new Set(stops.map(s => s.pickup_point_id)), [stops])

  return (
    <ModalShell onClose={onClose} title={`${route.name} — DURAKLAR`} wide>
      {stops.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Henüz durak yok</div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {stops.map((s, idx) => (
            <div key={s.id} style={{
              display: 'grid', gridTemplateColumns: '32px 1fr 80px 32px', gap: 10, alignItems: 'center',
              padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6,
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent)', textAlign: 'center' }}>{idx + 1}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>📍 {s.point_name}</div>
                {s.district && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{s.district}</div>}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{s.scheduled_time || '—'}</div>
              <button onClick={() => delMut.mutate(s.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', borderRadius: 6 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 6, marginBottom: 10 }}>
          <select className="form-select" value={pickupId} onChange={e => setPickupId(e.target.value)} style={{ borderRadius: 8, fontSize: 12 }}>
            <option value="">Durak seç…</option>
            {points.filter(p => !usedIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.district ? `[${p.district}] ` : ''}{p.name}</option>)}
          </select>
          <input className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} style={{ borderRadius: 8, fontSize: 12 }} />
          <button onClick={() => addMut.mutate()} disabled={!pickupId || addMut.isPending} className="btn btn-primary btn-sm" style={{ borderRadius: 8 }}>EKLE</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10, width: '100%', marginBottom: 12 }}>+ DURAK EKLE</button>
      )}

      {/* Harita önizleme */}
      {stops.some(s => s.lat != null && s.lng != null) && (
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 6 }}>🗺 HARITA ÖNİZLEME</div>
          <Suspense fallback={<SkeletonBlock height={280} />}>
            <RouteMap stops={stops} routeColor={route.color} />
          </Suspense>
        </div>
      )}
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONEL — durak atama yönetimi
// ─────────────────────────────────────────────────────────────────────────────
function PeopleTab() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('all') // all | yes | no
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  const hasPickupParam = filter === 'all' ? '' : `&has_pickup=${filter}`
  const { data: staff = [] } = useQuery({
    queryKey: ['transport-staff', filter],
    queryFn: () => api.get(`/transport/staff?_=1${hasPickupParam}`).then(r => r.data),
  })
  const { data: points = [] } = useQuery({
    queryKey: ['pickup-points-active'],
    queryFn: () => api.get('/transport/pickup-points?active=1').then(r => r.data),
  })

  const filtered = useMemo(() => {
    if (!search) return staff
    const q = search.toLowerCase()
    return staff.filter(s =>
      s.full_name.toLowerCase().includes(q) ||
      (s.pickup_name || '').toLowerCase().includes(q) ||
      (s.role_label || '').toLowerCase().includes(q) ||
      (s.dept_name || '').toLowerCase().includes(q)
    )
  }, [staff, search])

  // Durak bazında gruplandır
  const byPickup = useMemo(() => {
    const groups = new Map()
    filtered.forEach(s => {
      const key = s.pickup_point_id ?? 0
      const label = s.pickup_point_id ? `${s.pickup_district ? `[${s.pickup_district}] ` : ''}${s.pickup_name}` : '(Durak atanmamış)'
      if (!groups.has(key)) groups.set(key, { key, label, items: [], district: s.pickup_district })
      groups.get(key).items.push(s)
    })
    return Array.from(groups.values())
  }, [filtered])

  const pickMut = useMutation({
    mutationFn: ({ id, pickup_point_id }) => api.put(`/transport/staff/${id}/pickup`, { pickup_point_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-staff'] })
      qc.invalidateQueries({ queryKey: ['transport-points'] })
      qc.invalidateQueries({ queryKey: ['transport-daily'] })
      setEditingId(null); toast('Durak güncellendi')
    },
    onError: toastErr,
  })

  const totals = useMemo(() => ({
    total: staff.length,
    assigned: staff.filter(s => s.pickup_point_id).length,
    missing: staff.filter(s => !s.pickup_point_id).length,
  }), [staff])

  return (
    <div>
      {/* Filtre + arama */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" placeholder="Ara: ad, durak, rol…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 240px', fontSize: 12, borderRadius: 10 }} />
        <div style={{ display: 'flex', gap: 3 }}>
          {[['all', `TÜMÜ ${totals.total}`], ['yes', `DURAKLI ${totals.assigned}`], ['no', `DURAKSIZ ${totals.missing}`]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`btn btn-xs ${filter === k ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 8 }}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => setImportOpen(true)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }} title="CSV ile toplu durak eşleştir">📥 İMPORT</button>
      </div>

      {/* Durak gruplu liste */}
      {byPickup.length === 0 ? (
        <EmptyState icon="👥" title="KAYIT YOK" desc="Personel listesi boş veya filtre eşleşmiyor" />
      ) : (
        byPickup.map(grp => (
          <div key={grp.key} style={{ marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{
              padding: '8px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: grp.key === 0 ? 'rgba(231,76,60,.05)' : 'var(--surface2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>{grp.key === 0 ? '⚠' : '📍'}</span>
                <strong style={{ fontSize: 13 }}>{grp.label}</strong>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{grp.items.length} kişi</span>
            </div>
            <div>
              {grp.items.map(s => (
                <div key={s.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'center',
                  padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 12,
                }}>
                  <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => setDetailId(s.id)}>
                    <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{s.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                      {s.dept_name || '—'}
                      {s.role_label ? ` · ${s.role_label}` : ''}
                      {s.phone ? ` · ${s.phone}` : ''}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {s.route_summary
                      ? s.route_summary.split(',').map((seg, i) => {
                        const [name, color] = seg.split('|')
                        return (
                          <span key={i} style={{
                            display: 'inline-block', padding: '1px 6px', borderRadius: 4, marginRight: 3,
                            background: `${color || '#3b82f6'}22`, color: color || '#3b82f6', fontWeight: 600,
                          }}>{name}</span>
                        )
                      })
                      : <span style={{ color: 'var(--text4)' }}>—</span>}
                  </div>
                  {editingId === s.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <select className="form-select" value={editValue} onChange={e => setEditValue(e.target.value)}
                        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, width: 'auto', maxWidth: 180 }}>
                        <option value="">(boş)</option>
                        {points.map(p => <option key={p.id} value={p.id}>{p.district ? `[${p.district}] ` : ''}{p.name}</option>)}
                      </select>
                      <button onClick={() => pickMut.mutate({ id: s.id, pickup_point_id: editValue ? +editValue : null })}
                        disabled={pickMut.isPending} className="btn btn-primary btn-xs" style={{ borderRadius: 6 }}>✓</button>
                      <button onClick={() => setEditingId(null)} className="btn btn-ghost btn-xs" style={{ borderRadius: 6 }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingId(s.id); setEditValue(s.pickup_point_id || '') }}
                      className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>DEĞIŞTIR</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {detailId && <StaffDetailDrawer staffId={detailId} onClose={() => setDetailId(null)} />}
      {importOpen && <BulkImportModal onClose={() => setImportOpen(false)} points={points} />}
    </div>
  )
}

// Personel servis detay drawer'ı
function StaffDetailDrawer({ staffId, onClose }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['staff-transport-detail', staffId],
    queryFn: () => api.get(`/transport/staff/${staffId}/detail`).then(r => r.data),
  })
  const { data: pp = [] } = useQuery({
    queryKey: ['pickup-points-active'],
    queryFn: () => api.get('/transport/pickup-points?active=1').then(r => r.data),
  })
  const [editingPickup, setEditingPickup] = useState(false)
  const [pickup, setPickup] = useState('')

  const pickMut = useMutation({
    mutationFn: () => api.put(`/transport/staff/${staffId}/pickup`, { pickup_point_id: pickup ? +pickup : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-staff'] })
      qc.invalidateQueries({ queryKey: ['staff-transport-detail', staffId] })
      qc.invalidateQueries({ queryKey: ['transport-daily'] })
      setEditingPickup(false); toast('Durak güncellendi')
    },
    onError: toastErr,
  })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, height: '100%', overflowY: 'auto', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 20, boxShadow: '-8px 0 32px rgba(0,0,0,.4)' }}>
        {isLoading || !data ? (
          <SkeletonTable rows={4} cols={4} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, color: 'var(--text)', margin: 0 }}>{data.person.full_name}</h3>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                  {data.person.dept_name || '—'}{data.person.role_label ? ` · ${data.person.role_label}` : ''}
                </div>
                {data.person.phone && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--blue)', marginTop: 4 }}>
                    📞 <a href={`tel:${data.person.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{data.person.phone}</a>
                    {' · '}
                    <a href={`https://wa.me/${data.person.phone.replace(/\D/g, '').replace(/^0/, '90')}`} target="_blank" rel="noreferrer" style={{ color: '#25D366', textDecoration: 'none' }}>WhatsApp</a>
                  </div>
                )}
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>📍 MEVCUT DURAK</span>
                {!editingPickup && (
                  <button onClick={() => { setPickup(data.person.pickup_point_id || ''); setEditingPickup(true) }}
                    className="btn btn-ghost btn-xs" style={{ borderRadius: 6 }}>DEĞIŞTIR</button>
                )}
              </div>
              {editingPickup ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <select className="form-select" value={pickup} onChange={e => setPickup(e.target.value)} style={{ flex: 1, fontSize: 12, borderRadius: 8 }}>
                    <option value="">(durak yok)</option>
                    {pp.map(p => <option key={p.id} value={p.id}>{p.district ? `[${p.district}] ` : ''}{p.name}</option>)}
                  </select>
                  <button onClick={() => pickMut.mutate()} disabled={pickMut.isPending} className="btn btn-primary btn-sm" style={{ borderRadius: 8 }}>✓</button>
                  <button onClick={() => setEditingPickup(false)} className="btn btn-ghost btn-sm" style={{ borderRadius: 8 }}>✕</button>
                </div>
              ) : data.person.pickup_name ? (
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  📍 {data.person.pickup_name}
                  {data.person.pickup_district && <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>{data.person.pickup_district}</span>}
                </div>
              ) : (
                <div style={{ color: 'var(--red)', fontStyle: 'italic', fontSize: 12 }}>⚠ Durak atanmamış</div>
              )}
            </div>

            {data.availableRoutes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 6 }}>🛣 BU DURAKTAN GEÇEN ROTALAR ({data.availableRoutes.length})</div>
                {data.availableRoutes.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 4, borderLeft: `3px solid ${r.color || 'var(--accent)'}` }}>
                    <div style={{ flex: 1, fontSize: 12 }}>
                      <strong>{r.name}</strong>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 8 }}>
                        {r.vehicle_plate || '—'}
                        {r.shift_name ? ` · ${r.shift_name}` : ''}
                        {r.scheduled_time ? ` · ⏱ ${r.scheduled_time}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 6 }}>📅 SON ATAMALAR ({data.assignments.length})</div>
              {data.assignments.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text4)', fontFamily: 'var(--mono)', fontSize: 11 }}>Henüz atama yok</div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {data.assignments.map((a, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 60px', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{a.work_date}</span>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: a.route_color || 'var(--accent)' }}>{a.route_name}</span>
                        {a.stop_name && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 6 }}>📍 {a.stop_name}</span>}
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textAlign: 'right' }}>{a.scheduled_time || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BulkImportModal({ onClose, points }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)

  function parse() {
    const rows = text.trim().split('\n').filter(l => l.trim())
    if (rows.length < 2) { setPreview({ error: 'En az 1 satır veri (+ başlık) gerekli' }); return }
    const header = rows[0].split(/[,;\t]/).map(s => s.trim().toLowerCase())
    const nameIdx = header.findIndex(h => /(ad|name|isim)/.test(h))
    const pickupIdx = header.findIndex(h => /(durak|pickup|nokta)/.test(h))
    if (nameIdx < 0) { setPreview({ error: 'Başlıkta "ad" veya "name" kolonu bulunmalı' }); return }
    if (pickupIdx < 0) { setPreview({ error: 'Başlıkta "durak" veya "pickup" kolonu bulunmalı' }); return }

    const parsed = []
    const pointMap = new Map(points.map(p => [p.name.toLowerCase(), p]))
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(/[,;\t]/).map(s => s.trim())
      const name = cols[nameIdx]
      const pickupName = cols[pickupIdx]
      if (!name) continue
      const matched = pointMap.get(pickupName?.toLowerCase() || '')
      parsed.push({ name, pickupName, matched: matched || null })
    }
    setPreview({ rows: parsed })
  }

  const importMut = useMutation({
    mutationFn: async () => {
      const ok = preview.rows.filter(r => r.matched)
      const results = { matched: 0, notFound: [] }
      const staffList = (await api.get('/transport/staff')).data
      const staffMap = new Map(staffList.map(s => [s.full_name.toLowerCase(), s]))
      for (const r of ok) {
        const staff = staffMap.get(r.name.toLowerCase())
        if (!staff) { results.notFound.push(r.name); continue }
        await api.put(`/transport/staff/${staff.id}/pickup`, { pickup_point_id: r.matched.id })
        results.matched++
      }
      return results
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['transport-staff'] })
      qc.invalidateQueries({ queryKey: ['transport-daily'] })
      setResult(r); toast(`${r.matched} kişi atandı`)
    },
    onError: toastErr,
  })

  const sampleCsv = 'ad,durak\nAhmet Kaya,Zonguldak — Çaycuma\nMehmet Demir,Bartın — Merkez'

  return (
    <ModalShell onClose={onClose} title="TOPLU İMPORT — PERSONEL/DURAK" wide>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
        CSV/TSV formatı: <strong>ad,durak</strong>. Durak adı sistemde tam eşleşmeli.
      </div>

      {!preview && !result && (
        <>
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder={sampleCsv}
            style={{ width: '100%', height: 200, fontFamily: 'var(--mono)', fontSize: 11, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'space-between' }}>
            <button onClick={() => setText(sampleCsv)} className="btn btn-ghost btn-sm" style={{ borderRadius: 8 }}>ÖRNEK YÜKLE</button>
            <button onClick={parse} disabled={!text.trim()} className="btn btn-primary btn-sm" style={{ borderRadius: 8 }}>📋 ÖN İZLEME</button>
          </div>
        </>
      )}

      {preview?.error && (
        <div className="alert alert-danger" style={{ marginTop: 10, borderRadius: 8 }}>
          <span>!</span><span>{preview.error}</span>
        </div>
      )}

      {preview?.rows && !result && (
        <>
          <div style={{ marginTop: 10, marginBottom: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
            {preview.rows.length} satır · {preview.rows.filter(r => r.matched).length} eşleşti · {preview.rows.filter(r => !r.matched).length} bulunamadı
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: 6, textAlign: 'left' }}>AD</th>
                  <th style={{ padding: 6, textAlign: 'left' }}>DURAK (CSV)</th>
                  <th style={{ padding: 6, textAlign: 'left' }}>EŞLEŞEN</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}>{r.name}</td>
                    <td style={{ padding: 6, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.pickupName || '—'}</td>
                    <td style={{ padding: 6, color: r.matched ? 'var(--green)' : 'var(--red)' }}>
                      {r.matched ? `✓ ${r.matched.name}` : '✕ bulunamadı'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={() => setPreview(null)} className="btn btn-ghost" style={{ borderRadius: 8 }}>GERİ</button>
            <button onClick={() => importMut.mutate()} disabled={importMut.isPending || preview.rows.filter(r => r.matched).length === 0}
              className="btn btn-primary" style={{ borderRadius: 8 }}>
              {importMut.isPending ? '...' : `${preview.rows.filter(r => r.matched).length} ATAMA YAP`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, marginBottom: 4 }}>TAMAMLANDI</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
            {result.matched} kişiye durak atandı
            {result.notFound.length > 0 && ` · ${result.notFound.length} kişi bulunamadı`}
          </div>
          {result.notFound.length > 0 && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--surface2)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--red)', maxHeight: 100, overflowY: 'auto' }}>
              Bulunamayan: {result.notFound.join(', ')}
            </div>
          )}
          <button onClick={onClose} className="btn btn-primary" style={{ marginTop: 14, borderRadius: 8 }}>KAPAT</button>
        </div>
      )}
    </ModalShell>
  )
}

