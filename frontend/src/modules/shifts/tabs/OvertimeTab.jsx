import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import {
  toastErr, formatDate, deptColor,
  ModalOverlay, SidePanel, StaffSearch,
} from '../shared.jsx'

export default function OvertimeTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editRecord, setEditRecord] = useState(null) // { ...record, rect }
  const [form, setForm] = useState({ staff_id: '', work_date: '', hours: '', reason: '' })

  const { data: records = [] } = useQuery({
    queryKey: ['overtime', month, deptFilter],
    queryFn: () => api.get('/shifts/overtime', { params: { month, dept_id: deptFilter || undefined } }).then(r => r.data),
  })

  const { data: summary = [] } = useQuery({
    queryKey: ['overtime-summary', month],
    queryFn: () => api.get('/shifts/overtime/summary', { params: { month } }).then(r => r.data),
  })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['overtime'] })
    qc.invalidateQueries({ queryKey: ['overtime-summary'] })
  }

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/overtime', data),
    onSuccess: () => { invalidateAll(); setShowForm(false); setForm({ staff_id: '', work_date: '', hours: '', reason: '' }) },
    onError: toastErr,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/overtime/${id}`, data),
    onSuccess: () => { invalidateAll(); setEditRecord(null) },
    onError: toastErr,
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/shifts/overtime/${id}`),
    onSuccess: () => { invalidateAll(); setEditRecord(null) },
  })

  const openEdit = (e, r) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setEditRecord({ ...r, rect })
    setForm({ staff_id: r.staff_id, work_date: r.work_date, hours: r.hours?.toString() || '', reason: r.reason || '' })
  }

  const openNew = () => {
    setEditRecord(null)
    setForm({ staff_id: '', work_date: '', hours: '', reason: '' })
    setShowForm(true)
  }

  const totalHours = records.reduce((s, r) => s + r.hours, 0)
  const uniqueStaff = new Set(records.map(r => r.staff_id)).size

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)}
          style={{ width: 'auto', padding: '5px 11px', fontSize: '12px' }} />
        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew} style={{ marginLeft: 'auto' }}>
            + Mesai Ekle
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'TOPLAM MESAI', value: `${totalHours.toFixed(1)}s`, color: 'var(--purple)' },
          { label: 'MESAI KAYDI', value: records.length, color: 'var(--text)' },
          { label: 'KISI SAYISI', value: uniqueStaff, color: 'var(--blue)' },
          { label: 'ORT./KISI', value: uniqueStaff ? `${(totalHours / uniqueStaff).toFixed(1)}s` : '—', color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '14px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {summary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {summary.map(s => {
            const dc = deptColor(s.color_class)
            return (
              <div key={s.dept_id} style={{ padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', background: dc.bg, color: dc.text, fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600 }}>{s.dept_name}</span>
                <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color: 'var(--text)', lineHeight: 1, marginTop: '8px' }}>{s.total_hours?.toFixed(1)}s</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{s.staff_count} kisi</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">MESAI KAYITLARI</div><div className="panel-subtitle">{records.length} KAYIT</div></div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {records.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#9201;</div>
              <div className="empty-title">MESAI YOK</div>
              <div className="empty-sub">Bu ay mesai kaydi yok</div>
            </div>
          ) : (
            <table className="data-table responsive-stack">
              <thead><tr><th>Personel</th><th>Bolum</th><th>Tarih</th><th>Saat</th><th>Sebep</th>{canEdit && <th>Islem</th>}</tr></thead>
              <tbody>
                {records.map(r => {
                  const dc = deptColor(r.dept_color)
                  return (
                    <tr key={r.id}>
                      <td data-label="Personel">
                        <div
                          onClick={() => r.staff_id && onPersonClick && onPersonClick(r.staff_id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', borderBottom: '1px dashed var(--text3)' }}>
                          <span style={{ color: r.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>{r.gender === 'female' ? '♀' : '♂'}</span>
                          <span>{r.full_name}</span>
                        </div>
                      </td>
                      <td data-label="Bolum"><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', background: dc.bg, color: dc.text, fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600 }}>{r.dept_name}</span></td>
                      <td data-label="Tarih" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{formatDate(r.work_date)}</td>
                      <td data-label="Saat" style={{ fontFamily: 'var(--display)', fontSize: '18px', color: 'var(--purple)' }}>{r.hours}s</td>
                      <td data-label="Sebep" style={{ color: 'var(--text2)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '—'}</td>
                      {canEdit && (
                        <td data-label="Islem">
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px', padding: '3px 8px' }}
                              onClick={(e) => openEdit(e, r)}>Duzenle</button>
                            <button className="btn btn-danger btn-sm" style={{ fontSize: '10px', padding: '3px 8px' }}
                              onClick={async () => { if (await confirmDialog({ title: 'Mesai Kaydı Sil', body: 'Bu mesai kaydını silmek istediğinizden emin misiniz?', danger: true })) deleteMut.mutate(r.id) }}>
                              Sil
                            </button>
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

      {/* Create modal */}
      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>MESAI KAYDI EKLE</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Personel</label>
              <StaffSearch value={form.staff_id} onChange={v => setForm(p => ({ ...p, staff_id: v }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Tarih</label>
                <input type="date" className="form-input" value={form.work_date} onChange={e => setForm(p => ({ ...p, work_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Saat</label>
                <input type="number" step="0.5" min="0.5" max="12" className="form-input" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Sebep</label>
              <input className="form-input" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (createMut.isPending || !form.staff_id || !form.work_date || !form.hours) ? 0.5 : 1 }}
              onClick={() => createMut.mutate({ ...form, staff_id: parseInt(form.staff_id), hours: parseFloat(form.hours) })}
              disabled={createMut.isPending || !form.staff_id || !form.work_date || !form.hours}>
              {createMut.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {/* Edit — side panel */}
      {editRecord && (
        <SidePanel
          title="MESAI DUZENLE"
          subtitle={editRecord.full_name}
          icon="&#9201;"
          onClose={() => setEditRecord(null)}
          width={320}
          anchorRect={editRecord.rect}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Tarih</label>
                <input type="date" className="form-input"
                  value={form.work_date} onChange={e => setForm(p => ({ ...p, work_date: e.target.value }))} />
              </div>
              <div style={{ width: '100px' }}>
                <label className="form-label">Saat</label>
                <input type="number" step="0.5" min="0.5" max="12" className="form-input"
                  value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Sebep</label>
              <input className="form-input"
                value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }}
                disabled={updateMut.isPending || !form.hours}
                onClick={() => updateMut.mutate({ id: editRecord.id, work_date: form.work_date, hours: parseFloat(form.hours), reason: form.reason })}>
                {updateMut.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button className="btn btn-danger"
                onClick={async () => { if (await confirmDialog({ title: 'Sil', body: 'Bu kayıt silinsin mi?', danger: true })) deleteMut.mutate(editRecord.id) }}>
                Sil
              </button>
            </div>
          </div>
        </SidePanel>
      )}
    </div>
  )
}
