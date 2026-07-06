import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'
import { ModalShell, EmptyState, toast, toastErr } from '../shared.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// PERSONEL — durak atama yönetimi
// ─────────────────────────────────────────────────────────────────────────────
export default function PeopleTab() {
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

