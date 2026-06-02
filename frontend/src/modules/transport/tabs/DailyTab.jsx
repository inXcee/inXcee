import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'
import { KPI, toast, toastErr } from '../shared.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// BUGÜN — Daily Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export default function DailyTab({ date }) {
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
