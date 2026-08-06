import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useProjects, NO_PROJECT } from '../../../shared/hooks/useProjects.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import {
  toastErr, toastOk, LEAVE_TYPES, STATUS_MAP, formatDate, deptColor,
  ModalOverlay, StaffSearch,
} from '../shared.jsx'

const EMPTY_FORM = {
  staff_id: '', leave_type: 'annual', start_date: '', end_date: '', leave_hours: '', reason: '', files: [],
}

function uploadDocuments(type, id, files) {
  if (!files?.length) return Promise.resolve()
  const body = new FormData()
  files.forEach(file => body.append('documents', file))
  return api.post(`/shifts/request-documents/${type}/${id}`, body)
}

function documentHref(fileUrl) {
  if (!fileUrl) return '#'
  return fileUrl.startsWith('/uploads/') ? fileUrl : `/uploads/${fileUrl.split('/').pop()}`
}

export default function LeaveTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(state => state.user)
  const canApprove = ['campus_manager', 'shift_supervisor'].includes(user?.role)
  const [filters, setFilters] = useState({ status: '', dept_id: '', project_id: '', leave_type: '' })
  const { projects } = useProjects()
  const [newLeave, setNewLeave] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [review, setReview] = useState(null)

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', filters],
    queryFn: () => api.get('/shifts/leave', { params: filters }).then(response => response.data),
  })
  const { data: puantajCodes = [] } = useQuery({
    queryKey: ['puantaj-codes'],
    queryFn: () => api.get('/shifts/puantaj/codes', { params: { all: '1' } }).then(response => response.data),
  })

  const ruleByLeaveType = useMemo(() => Object.fromEntries(
    puantajCodes.filter(code => code.status === 'on_leave').map(code => [code.leave_type, code])
  ), [puantajCodes])

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['leaves'] })
    qc.invalidateQueries({ queryKey: ['leave-balance'] })
    qc.invalidateQueries({ queryKey: ['puantaj'] })
    qc.invalidateQueries({ queryKey: ['puantaj-days-month'] })
  }

  const createMut = useMutation({
    mutationFn: async data => {
      const payload = {
        staff_id: Number(data.staff_id),
        leave_type: data.leave_type,
        start_date: data.start_date,
        end_date: data.end_date,
        leave_hours: data.leave_hours === '' ? null : Number(data.leave_hours),
        reason: data.reason.trim() || null,
      }
      const created = await api.post('/shifts/leave', payload)
      await uploadDocuments('leave', created.data.id, data.files)
      return created.data
    },
    onSuccess: () => {
      invalidateAll()
      setNewLeave(false)
      setForm(EMPTY_FORM)
      toastOk('İzin talebi kaydedildi')
    },
    onError: toastErr,
  })

  const approveMut = useMutation({
    mutationFn: ({ leave, status, note }) => api.patch(`/shifts/leave/${leave.id}`, {
      status,
      review_note: note.trim() || null,
      expected_version: leave.version,
    }),
    onSuccess: () => {
      invalidateAll()
      setReview(null)
      toastOk('İzin talebi güncellendi')
    },
    onError: error => {
      toastErr(error)
      if (error?.response?.status === 409) invalidateAll()
    },
  })

  const uploadMut = useMutation({
    mutationFn: ({ id, files }) => uploadDocuments('leave', id, files),
    onSuccess: () => { invalidateAll(); toastOk('Belge talebe eklendi') },
    onError: toastErr,
  })

  const cancelMut = useMutation({
    mutationFn: id => api.delete(`/shifts/leave/${id}`),
    onSuccess: () => { invalidateAll(); toastOk('İzin iptal edildi') },
    onError: toastErr,
  })

  const countByType = Object.fromEntries(
    Object.keys(LEAVE_TYPES).map(type => [type, leaves.filter(leave => leave.leave_type === type).length])
  )

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        {['', 'pending', 'approved', 'rejected'].map(status => (
          <button key={status} className={`filter-chip ${filters.status === status ? 'active' : ''}`}
            onClick={() => setFilters(previous => ({ ...previous, status }))}>
            {status === '' ? 'Tümü' : STATUS_MAP[status]?.label}
          </button>
        ))}
        <select className="form-select" value={filters.project_id} aria-label="İzin projesi"
          onChange={event => setFilters(previous => ({ ...previous, project_id: event.target.value }))}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tüm Projeler</option>
          {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
          <option value={NO_PROJECT}>Kadrosu belirsiz</option>
        </select>
        <select className="form-select" value={filters.dept_id}
          onChange={event => setFilters(previous => ({ ...previous, dept_id: event.target.value }))}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tüm Bölümler</option>
          {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <select className="form-select" value={filters.leave_type}
          onChange={event => setFilters(previous => ({ ...previous, leave_type: event.target.value }))}
          style={{ width: 'auto', minWidth: '130px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tüm İzinler</option>
          {Object.entries(LEAVE_TYPES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => setNewLeave(true)} style={{ marginLeft: 'auto' }}>
          + Yeni İzin
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: '8px', marginBottom: '18px' }}>
        {Object.entries(LEAVE_TYPES).map(([key, meta]) => (
          <div key={key} style={{ padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '23px', color: 'var(--text)', lineHeight: 1 }}>{countByType[key]}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>{meta.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">İZİN TALEPLERİ</div>
            <div className="panel-subtitle">{leaves.length} KAYIT · BELGE VE ONAY TAKİPLİ</div>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {leaves.length === 0 ? (
            <div className="empty-state"><div className="empty-title">İZİN YOK</div><div className="empty-sub">Bu filtrede izin talebi bulunamadı</div></div>
          ) : (
            <table className="data-table responsive-stack">
              <thead><tr><th>Personel</th><th>Tür / Kural</th><th>Tarih</th><th>Süre</th><th>Gerekçe</th><th>Belge</th><th>Durum</th><th>İşlem</th></tr></thead>
              <tbody>
                {leaves.map(leave => {
                  const color = deptColor(leave.dept_color)
                  const rule = ruleByLeaveType[leave.leave_type]
                  const missingDocument = !!rule?.requires_document && !leave.document_count
                  const missingReason = !!rule?.requires_reason && !leave.reason?.trim()
                  return (
                    <tr key={leave.id}>
                      <td data-label="Personel">
                        <button type="button" onClick={() => onPersonClick?.(leave.staff_id)}
                          style={{ appearance: 'none', border: 0, background: 'none', color: 'inherit', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                          <div style={{ fontWeight: 650 }}>{leave.full_name}</div>
                          <span style={{ display: 'inline-block', marginTop: '3px', padding: '2px 7px', borderRadius: '10px', background: color.bg, color: color.text, fontFamily: 'var(--mono)', fontSize: '8px' }}>
                            {leave.dept_name || 'Bölümsüz'}
                          </span>
                        </button>
                      </td>
                      <td data-label="Tür / Kural">
                        <span className={`badge ${LEAVE_TYPES[leave.leave_type]?.badge || 'badge-gray'}`}>{LEAVE_TYPES[leave.leave_type]?.label || leave.leave_type}</span>
                        {(rule?.requires_document || rule?.requires_reason) && (
                          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: missingDocument || missingReason ? 'var(--red)' : 'var(--green)', marginTop: '4px' }}>
                            {[rule.requires_document && 'belge', rule.requires_reason && 'gerekçe'].filter(Boolean).join(' + ')} zorunlu
                          </div>
                        )}
                      </td>
                      <td data-label="Tarih" style={{ fontFamily: 'var(--mono)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                        {formatDate(leave.start_date)} – {formatDate(leave.end_date)}
                      </td>
                      <td data-label="Süre">
                        <strong>{leave.leave_hours ? `${leave.leave_hours} saat` : `${leave.total_days} gün`}</strong>
                      </td>
                      <td data-label="Gerekçe" style={{ maxWidth: '180px', color: leave.reason ? 'var(--text2)' : 'var(--text3)', fontSize: '11px' }}>
                        {leave.reason || (rule?.requires_reason ? 'Gerekçe eksik' : '—')}
                        {leave.review_note && <div style={{ marginTop: '4px', color: 'var(--accent)', fontSize: '9px' }}>Amir: {leave.review_note}</div>}
                      </td>
                      <td data-label="Belge">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          {(leave.documents || []).map((document, index) => (
                            <a key={document.id} className="btn btn-ghost btn-sm" href={documentHref(document.file_url)} target="_blank" rel="noreferrer"
                              title={document.file_name} style={{ padding: '2px 6px', fontSize: '9px' }}>Dosya {index + 1}</a>
                          ))}
                          {!leave.document_count && <span style={{ color: missingDocument ? 'var(--red)' : 'var(--text3)', fontSize: '9px' }}>{missingDocument ? 'Eksik' : 'Yok'}</span>}
                          <label className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>
                            Ekle
                            <input type="file" multiple accept="image/*,.pdf" hidden onChange={event => {
                              const files = [...event.target.files].slice(0, 5)
                              if (files.length) uploadMut.mutate({ id: leave.id, files })
                              event.target.value = ''
                            }} />
                          </label>
                        </div>
                      </td>
                      <td data-label="Durum"><span className={`badge ${STATUS_MAP[leave.status]?.badge || 'badge-gray'}`}>{STATUS_MAP[leave.status]?.label || leave.status}</span></td>
                      <td data-label="İşlem">
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {canApprove && leave.status === 'pending' && <>
                            <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#06130a' }} onClick={() => setReview({ leave, status: 'approved', note: '' })}>Onayla</button>
                            <button className="btn btn-danger btn-sm" onClick={() => setReview({ leave, status: 'rejected', note: '' })}>Reddet</button>
                          </>}
                          {canApprove && leave.status === 'approved' && <button className="btn btn-danger btn-sm" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate(leave.id)}>İptal</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {newLeave && (
        <ModalOverlay onClose={() => setNewLeave(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '1px', margin: '0 0 16px' }}>YENİ İZİN TALEBİ</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label className="form-label">Personel</label><StaffSearch value={form.staff_id} onChange={value => setForm(previous => ({ ...previous, staff_id: value }))} /></div>
            <div>
              <label className="form-label">İzin türü</label>
              <select className="form-select" value={form.leave_type} onChange={event => setForm(previous => ({ ...previous, leave_type: event.target.value }))}>
                {Object.entries(LEAVE_TYPES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div><label className="form-label">Başlangıç</label><input type="date" className="form-input" value={form.start_date} onChange={event => setForm(previous => ({ ...previous, start_date: event.target.value }))} /></div>
              <div><label className="form-label">Bitiş</label><input type="date" className="form-input" value={form.end_date} onChange={event => setForm(previous => ({ ...previous, end_date: event.target.value }))} /></div>
            </div>
            <div>
              <label className="form-label">Saatlik izin</label>
              <input type="number" min="0.5" max="8" step="0.5" className="form-input" value={form.leave_hours}
                onChange={event => setForm(previous => ({ ...previous, leave_hours: event.target.value }))} placeholder="Tam gün için boş bırakın" />
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '4px' }}>Saatlik izin yalnız tek gün için girilebilir.</div>
            </div>
            <div>
              <label className="form-label">Gerekçe</label>
              <textarea className="form-textarea" rows={2} value={form.reason} onChange={event => setForm(previous => ({ ...previous, reason: event.target.value }))} style={{ minHeight: '58px' }} />
            </div>
            <div>
              <label className="form-label">Belge / fotoğraf (en fazla 5)</label>
              <input type="file" multiple accept="image/*,.pdf" className="form-input" onChange={event => setForm(previous => ({ ...previous, files: [...event.target.files].slice(0, 5) }))} />
              {!!form.files.length && <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '4px' }}>{form.files.length} dosya seçildi</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={createMut.isPending || !form.staff_id || !form.start_date || !form.end_date}
              onClick={() => createMut.mutate(form)}>{createMut.isPending ? 'Kaydediliyor...' : 'Talebi Kaydet'}</button>
            <button className="btn btn-ghost" onClick={() => setNewLeave(false)}>Vazgeç</button>
          </div>
        </ModalOverlay>
      )}

      {review && (
        <ModalOverlay onClose={() => setReview(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px', margin: '0 0 6px' }}>
            {review.status === 'approved' ? 'İZİN ONAYI' : 'İZİN REDDİ'}
          </h3>
          <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '14px' }}>{review.leave.full_name} · {formatDate(review.leave.start_date)}</div>
          <label className="form-label">Amir notu {review.status === 'rejected' ? '(zorunlu)' : '(isteğe bağlı)'}</label>
          <textarea className="form-textarea" rows={3} value={review.note} onChange={event => setReview(previous => ({ ...previous, note: event.target.value }))} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className={review.status === 'approved' ? 'btn btn-primary' : 'btn btn-danger'} style={{ flex: 1 }}
              disabled={approveMut.isPending || (review.status === 'rejected' && review.note.trim().length < 3)}
              onClick={() => approveMut.mutate(review)}>{approveMut.isPending ? 'İşleniyor...' : review.status === 'approved' ? 'Onayı Tamamla' : 'Talebi Reddet'}</button>
            <button className="btn btn-ghost" onClick={() => setReview(null)}>Vazgeç</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
