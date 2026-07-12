import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { toastErr, deptColor, ModalOverlay, StaffSearch } from '../shared.jsx'

export default function DepartmentsTab() {
  const qc = useQueryClient()
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/shifts/departments').then(r => r.data) })
  const [editDept, setEditDept] = useState(null)
  const [deptForm, setDeptForm] = useState({ name: '', color_class: 'bg-blue-600', description: '' })
  const [assignModal, setAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({ staff_id: '', dept_id: '' })

  const { data: deptSummary = [] } = useQuery({ queryKey: ['departments-summary'], queryFn: () => api.get('/shifts/departments/summary').then(r => r.data) })

  // Departman düzenleme/atama açık çizelgeyi (band adı/renk, kişi grubu) da tazelesin
  const refreshPlan = () => {
    const keys = ['departments', 'departments-summary', 'staff-list', 'staff-list-active', 'schedule', 'shift-breakdown', 'shift-coverage']
    keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  }
  const createDept = useMutation({ mutationFn: data => api.post('/shifts/departments', data), onSuccess: () => { refreshPlan(); setEditDept(null) }, onError: toastErr })
  const updateDept = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/departments/${id}`, data), onSuccess: () => { refreshPlan(); setEditDept(null) }, onError: toastErr })
  const deleteDept = useMutation({ mutationFn: (id) => api.delete(`/shifts/departments/${id}`), onSuccess: refreshPlan })
  const assignMut = useMutation({ mutationFn: data => api.post('/shifts/departments/assign', data), onSuccess: () => { refreshPlan(); setAssignModal(false); setAssignForm({ staff_id: '', dept_id: '' }) }, onError: toastErr })

  const COLOR_OPTIONS = ['bg-red-600', 'bg-green-600', 'bg-orange-500', 'bg-blue-600', 'bg-yellow-500', 'bg-lime-500', 'bg-pink-500', 'bg-purple-600']
  const maxCount = Math.max(...deptSummary.map(d => d.staff_count || 0), 1)

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setAssignModal(true)}>Personel Ata</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setDeptForm({ name: '', color_class: 'bg-blue-600', description: '' }); setEditDept({}) }}>+ Yeni Bolum</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><div><div className="panel-title">BOLUMLER</div><div className="panel-subtitle">{deptSummary.length} BOLUM</div></div></div>
        <div className="panel-body">
          {deptSummary.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">&#127970;</div><div className="empty-title">BOLUM YOK</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {deptSummary.map(d => {
                const dc = deptColor(d.color_class)
                const pct = ((d.staff_count || 0) / maxCount) * 100
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ width: '100px', flexShrink: 0 }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', background: dc.bg, color: dc.text, fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600 }}>{d.name}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>{d.staff_count || 0} personel</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                          <span style={{ color: 'var(--blue)' }}>{'♂'}{d.male_count || 0}</span>{' '}<span style={{ color: '#f472b6' }}>{'♀'}{d.female_count || 0}</span>
                        </span>
                      </div>
                      <div className="prog-bar"><div className="prog-fill prog-blue" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setDeptForm({ name: d.name, color_class: d.color_class || 'bg-blue-600', description: d.description || '' }); setEditDept(d) }}>Duzenle</button>
                      <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Bölüm Sil', body: `${d.name} bölümünü silmek istediğinizden emin misiniz?`, danger: true })) deleteDept.mutate(d.id) }}>Sil</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {editDept !== null && (
        <ModalOverlay onClose={() => setEditDept(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>{editDept.id ? 'BOLUM DUZENLE' : 'YENI BOLUM'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Bolum Adi</label><input className="form-input" value={deptForm.name} onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="form-label">Aciklama</label><input className="form-input" value={deptForm.description} onChange={e => setDeptForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div>
              <label className="form-label">Renk</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {COLOR_OPTIONS.map(c => { const dc = deptColor(c); return (<button key={c} onClick={() => setDeptForm(p => ({ ...p, color_class: c }))} style={{ width: '32px', height: '32px', borderRadius: '6px', background: dc.bg, border: `2px solid ${deptForm.color_class === c ? dc.text : 'transparent'}`, cursor: 'pointer' }} />) })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !deptForm.name ? 0.5 : 1 }} disabled={!deptForm.name}
              onClick={() => { if (editDept.id) updateDept.mutate({ id: editDept.id, ...deptForm }); else createDept.mutate(deptForm) }}>
              {editDept.id ? 'Guncelle' : 'Olustur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditDept(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {assignModal && (
        <ModalOverlay onClose={() => setAssignModal(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>PERSONEL BOLUM ATAMASI</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Personel</label><StaffSearch value={assignForm.staff_id} onChange={v => setAssignForm(p => ({ ...p, staff_id: v }))} /></div>
            <div><label className="form-label">Bolum</label>
              <select className="form-select" value={assignForm.dept_id} onChange={e => setAssignForm(p => ({ ...p, dept_id: e.target.value }))}>
                <option value="">Bolum secin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!assignForm.staff_id || !assignForm.dept_id) ? 0.5 : 1 }}
              disabled={!assignForm.staff_id || !assignForm.dept_id || assignMut.isPending}
              onClick={() => assignMut.mutate({ staff_id: parseInt(assignForm.staff_id), dept_id: parseInt(assignForm.dept_id) })}>
              {assignMut.isPending ? 'Ataniyor...' : 'Ata'}
            </button>
            <button className="btn btn-ghost" onClick={() => setAssignModal(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
