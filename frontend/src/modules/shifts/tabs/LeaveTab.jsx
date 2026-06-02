import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import {
  toastErr, LEAVE_TYPES, STATUS_MAP, formatDate, deptColor,
  ModalOverlay, StaffSearch,
} from '../shared.jsx'

export default function LeaveTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canApprove = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [filters, setFilters] = useState({ status: '', dept_id: '', leave_type: '' })
  const [newLeave, setNewLeave] = useState(false)
  const [form, setForm] = useState({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', filters],
    queryFn: () => api.get('/shifts/leave', { params: filters }).then(r => r.data),
  })

  const approveMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/shifts/leave/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves'] }),
  })

  const cancelMut = useMutation({
    mutationFn: (id) => api.delete(`/shifts/leave/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves'] }),
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/leave', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] })
      setNewLeave(false)
      setForm({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })
    },
    onError: toastErr,
  })

  const countByType = Object.fromEntries(
    Object.keys(LEAVE_TYPES).map(k => [k, leaves.filter(l => l.leave_type === k).length])
  )

  return (
    <div className="fade-up">
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} className={`filter-chip ${filters.status === s ? 'active' : ''}`}
            onClick={() => setFilters(p => ({ ...p, status: s }))}>
            {s === '' ? 'Tumunu' : STATUS_MAP[s]?.label}
          </button>
        ))}
        <select className="form-select" value={filters.dept_id} onChange={e => setFilters(p => ({ ...p, dept_id: e.target.value }))}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => setNewLeave(true)} style={{ marginLeft: 'auto' }}>
          + Yeni Izin
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', marginBottom: '20px' }}>
        {Object.entries(LEAVE_TYPES).map(([k, v]) => (
          <div key={k} style={{
            padding: '10px 12px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: 'var(--text)', lineHeight: 1 }}>
              {countByType[k]}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
              {v.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Leave table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">IZIN TALEPLERI</div>
            <div className="panel-subtitle">{leaves.length} KAYIT</div>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {leaves.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#127796;</div>
              <div className="empty-title">IZIN YOK</div>
              <div className="empty-sub">Izin talebi bulunamadi</div>
            </div>
          ) : (
            <table className="data-table responsive-stack">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Bolum</th>
                  <th>Tur</th>
                  <th>Tarih</th>
                  <th>Gun</th>
                  <th>Durum</th>
                  {canApprove && <th>Islem</th>}
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => {
                  const dc = deptColor(l.dept_color)
                  return (
                    <tr key={l.id}>
                      <td data-label="Personel">
                        <div
                          onClick={() => l.staff_id && onPersonClick && onPersonClick(l.staff_id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', borderBottom: '1px dashed var(--text3)' }}>
                          <span style={{ color: l.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>
                            {l.gender === 'female' ? '♀' : '♂'}
                          </span>
                          <div>
                            <span>{l.full_name}</span>
                            {l.position && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{l.position}</div>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Bolum">
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                          background: dc.bg, color: dc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                        }}>{l.dept_name}</span>
                      </td>
                      <td data-label="Tur"><span className={`badge ${LEAVE_TYPES[l.leave_type]?.badge || 'badge-gray'}`}>{LEAVE_TYPES[l.leave_type]?.label}</span></td>
                      <td data-label="Tarih" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {formatDate(l.start_date)} &ndash; {formatDate(l.end_date)}
                      </td>
                      <td data-label="Gun" style={{ fontFamily: 'var(--mono)' }}>{l.total_days}</td>
                      <td data-label="Durum"><span className={`badge ${STATUS_MAP[l.status]?.badge}`}>{STATUS_MAP[l.status]?.label}</span></td>
                      {canApprove && (
                        <td data-label="Islem">
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {l.status === 'pending' && (
                              <>
                                <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }}
                                  onClick={() => approveMut.mutate({ id: l.id, status: 'approved' })}>Onayla</button>
                                <button className="btn btn-danger btn-sm"
                                  onClick={() => approveMut.mutate({ id: l.id, status: 'rejected' })}>Reddet</button>
                              </>
                            )}
                            {l.status === 'approved' && (
                              <button className="btn btn-danger btn-sm"
                                onClick={() => cancelMut.mutate(l.id)} disabled={cancelMut.isPending}>Iptal Et</button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New Leave Modal */}
      {newLeave && (
        <ModalOverlay onClose={() => setNewLeave(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            YENI IZIN TALEBI
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Personel</label>
              <StaffSearch value={form.staff_id} onChange={v => setForm(p => ({ ...p, staff_id: v }))} />
            </div>
            <div>
              <label className="form-label">Izin Turu</label>
              <select className="form-select" value={form.leave_type} onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))}>
                {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Baslangic</label>
                <input type="date" className="form-input" value={form.start_date}
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Bitis</label>
                <input type="date" className="form-input" value={form.end_date}
                  onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Aciklama (istege bagli)</label>
              <textarea className="form-textarea" value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2}
                style={{ minHeight: '60px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (createMut.isPending || !form.staff_id || !form.start_date || !form.end_date) ? 0.5 : 1 }}
              onClick={() => createMut.mutate(form)}
              disabled={createMut.isPending || !form.staff_id || !form.start_date || !form.end_date}>
              {createMut.isPending ? 'Kaydediliyor...' : 'Gonder'}
            </button>
            <button className="btn btn-ghost" onClick={() => setNewLeave(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
