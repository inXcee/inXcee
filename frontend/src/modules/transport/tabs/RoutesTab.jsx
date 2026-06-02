import { useState, useMemo, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { SkeletonBlock } from '../../../shared/components/Skeleton.jsx'
import { ModalShell, Label, ModalActions, EmptyState, todayStr, toast, toastErr } from '../shared.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// ROTALAR
// ─────────────────────────────────────────────────────────────────────────────
export default function RoutesTab() {
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

const RouteMap = lazy(() => import('../MapPicker.jsx').then(m => ({ default: m.RouteMap })))

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

