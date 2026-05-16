import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const TABS = [
  { key: 'daily', label: 'BUGÜN', icon: '🚌' },
  { key: 'routes', label: 'ROTALAR', icon: '🛣' },
  { key: 'points', label: 'DURAKLAR', icon: '📍' },
]

const todayStr = () => new Date().toISOString().slice(0, 10)
const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

export default function TransportPage() {
  const [tab, setTab] = useState('daily')
  const [date, setDate] = useState(todayStr())

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200 }} className="fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 30, letterSpacing: 5, color: 'var(--text)', margin: 0 }}>SERVİSLER</h1>
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

  if (isLoading) return <div style={{ padding: 40, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Yükleniyor…</div>
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

function KPI({ label, value, color, sub }) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 28, color, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 4 }}>{sub}</div>}
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

function ManifestDrawer({ routeId, date, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['manifest', routeId, date],
    queryFn: () => api.get(`/transport/routes/${routeId}/manifest?date=${date}`).then(r => r.data),
  })

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
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Yükleniyor…</div>
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
                {data.route.driver_name && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    🧑‍✈️ {data.route.driver_name} {data.route.driver_phone ? `· ${data.route.driver_phone}` : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => window.print()} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }} title="Yazdır">🖨</button>
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
                {s.passengers.length === 0 ? (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text4)' }}>Boş durak</div>
                ) : (
                  <div>
                    {s.passengers.map(p => (
                      <div key={p.staff_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                        <span>{p.full_name}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{p.dept_name || p.role_label || ''}</span>
                      </div>
                    ))}
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

  const { data: routes = [] } = useQuery({ queryKey: ['transport-routes'], queryFn: () => api.get('/transport/routes').then(r => r.data) })
  const { data: shiftDefs = [] } = useQuery({ queryKey: ['shift-defs'], queryFn: () => api.get('/shifts/shift-definitions').then(r => r.data) })

  const inv = () => qc.invalidateQueries({ queryKey: ['transport-routes'] })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{routes.length} ROTA</div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ ROTA</button>
      </div>

      {routes.length === 0 ? (
        <EmptyState icon="🛣" title="HENÜZ ROTA YOK" desc="İlk rotayı oluştur" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {routes.map(r => (
            <div key={r.id} style={{
              padding: 14, borderRadius: 12, background: 'var(--surface)',
              borderLeft: `4px solid ${r.color || 'var(--accent)'}`, border: '1px solid var(--border)',
              opacity: r.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>{r.name}</strong>
                {!r.is_active && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--surface3)', color: 'var(--text3)' }}>PASİF</span>}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
                🚌 {r.vehicle_plate || '—'} · 👥 {r.capacity} kişi · 📍 {r.stop_count} durak
                {r.shift_name ? ` · ⏱ ${r.shift_name}` : ''}
              </div>
              {r.driver_name && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
                  🧑‍✈️ {r.driver_name} {r.driver_phone ? `· ${r.driver_phone}` : ''}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setStopsOpen(r)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8, flex: 1 }}>DURAKLAR</button>
                <button onClick={() => setEditing(r)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8 }}>DÜZENLE</button>
              </div>
            </div>
          ))}
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

  const inv = () => { qc.invalidateQueries({ queryKey: ['route-stops', route.id] }); qc.invalidateQueries({ queryKey: ['transport-routes'] }) }

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
        <button onClick={() => setAdding(true)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10, width: '100%' }}>+ DURAK EKLE</button>
      )}
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DURAKLAR
// ─────────────────────────────────────────────────────────────────────────────
function PointsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const { data: points = [] } = useQuery({ queryKey: ['transport-points'], queryFn: () => api.get('/transport/pickup-points').then(r => r.data) })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/transport/pickup-points/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport-points'] }); toast('Durak kapatıldı') },
    onError: toastErr,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{points.length} DURAK</div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ DURAK</button>
      </div>

      {points.length === 0 ? (
        <EmptyState icon="📍" title="HENÜZ DURAK YOK" desc="İlk durağı oluştur" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {points.map(p => (
            <div key={p.id} style={{
              padding: 14, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)',
              opacity: p.is_active ? 1 : 0.55,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>📍</span>
                <strong style={{ fontSize: 13 }}>{p.name}</strong>
                {!p.is_active && <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 'auto' }}>PASİF</span>}
              </div>
              {p.district && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', marginBottom: 4 }}>{p.district} {p.neighborhood ? `· ${p.neighborhood}` : ''}</div>}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
                👥 {p.staff_count} personel · 🛣 {p.route_count} rota
              </div>
              {p.notes && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>{p.notes}</div>}
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setEditing(p)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8, flex: 1 }}>DÜZENLE</button>
                {p.is_active && <button onClick={() => delMut.mutate(p.id)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8, color: 'var(--red)' }}>KAPAT</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && <PointFormModal initial={editing} onClose={() => { setCreating(false); setEditing(null) }} onSaved={() => qc.invalidateQueries({ queryKey: ['transport-points'] })} />}
    </div>
  )
}

function PointFormModal({ initial, onClose, onSaved }) {
  const [name, setName] = useState(initial?.name || '')
  const [district, setDistrict] = useState(initial?.district || '')
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? 1)

  const mut = useMutation({
    mutationFn: () => {
      const body = { name, district, neighborhood, notes, is_active: isActive }
      return initial?.id ? api.put(`/transport/pickup-points/${initial.id}`, body) : api.post('/transport/pickup-points', body)
    },
    onSuccess: () => { onSaved(); onClose(); toast('Kaydedildi') },
    onError: toastErr,
  })

  return (
    <ModalShell onClose={onClose} title={initial?.id ? 'DURAK DÜZENLE' : 'YENİ DURAK'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <Label>Durak Adı *</Label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Ör: Eski Sanayi, Belediye Önü" style={{ borderRadius: 10 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <Label>İlçe / Bölge</Label>
            <input className="form-input" value={district} onChange={e => setDistrict(e.target.value)} placeholder="Merkez, Sahil…" style={{ borderRadius: 10 }} />
          </div>
          <div>
            <Label>Mahalle</Label>
            <input className="form-input" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} style={{ borderRadius: 10 }} />
          </div>
        </div>
        <div>
          <Label>Notlar</Label>
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="İşaret, yön tarifi, vb." style={{ borderRadius: 10 }} />
        </div>
        {initial?.id && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!isActive} onChange={e => setIsActive(e.target.checked ? 1 : 0)} /> Aktif
          </label>
        )}
      </div>
      <ModalActions onClose={onClose} onSave={() => mut.mutate()} disabled={!name || mut.isPending} loading={mut.isPending} />
    </ModalShell>
  )
}

// ─── Shared shells ──────────────────────────────────────────────────────────
function ModalShell({ children, onClose, title, wide }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} className="fade-up" style={{
        width: wide ? 640 : 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 20, boxShadow: '0 24px 48px rgba(0,0,0,.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function Label({ children }) {
  return <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, display: 'block', marginBottom: 4 }}>{children}</label>
}
function ModalActions({ onClose, onSave, disabled, loading }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
      <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: 10 }}>İPTAL</button>
      <button className="btn btn-primary" onClick={onSave} disabled={disabled} style={{ borderRadius: 10 }}>{loading ? '...' : 'KAYDET'}</button>
    </div>
  )
}
function EmptyState({ icon, title, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text3)' }}>
      <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2, marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{desc}</div>
    </div>
  )
}
