import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { toastErr, toastOk, formatDate, deptColor, ModalOverlay, StaffSearch } from '../shared.jsx'

const STATUS_META = {
  pending: { label: 'Bekliyor', badge: 'badge-amber' },
  approved: { label: 'Onaylandı', badge: 'badge-green' },
  returned: { label: 'İade Edildi', badge: 'badge-blue' },
  rejected: { label: 'Reddedildi', badge: 'badge-red' },
}

const EMPTY_FORM = {
  staff_id: '', work_date: '', requested_hours: '', planned_start: '', planned_end: '',
  reason: '', compensation_type: 'pay', files: [],
}

function uploadDocuments(id, files) {
  if (!files?.length) return Promise.resolve()
  const body = new FormData()
  files.forEach(file => body.append('documents', file))
  return api.post(`/shifts/request-documents/overtime/${id}`, body)
}

function documentHref(fileUrl) {
  if (!fileUrl) return '#'
  return fileUrl.startsWith('/uploads/') ? fileUrl : `/uploads/${fileUrl.split('/').pop()}`
}

export default function OvertimeTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(state => state.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [review, setReview] = useState(null)

  const { data: requests = [] } = useQuery({
    queryKey: ['overtime-requests', month, deptFilter, statusFilter],
    queryFn: () => api.get('/shifts/overtime/requests', { params: {
      month,
      dept_id: deptFilter || undefined,
      status: statusFilter || undefined,
    } }).then(response => response.data),
  })

  const { data: summary = [] } = useQuery({
    queryKey: ['overtime-summary', month],
    queryFn: () => api.get('/shifts/overtime/summary', { params: { month } }).then(response => response.data),
  })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['overtime-requests'] })
    qc.invalidateQueries({ queryKey: ['overtime'] })
    qc.invalidateQueries({ queryKey: ['overtime-summary'] })
    qc.invalidateQueries({ queryKey: ['puantaj'] })
    qc.invalidateQueries({ queryKey: ['puantaj-approval'] })
  }

  const createMut = useMutation({
    mutationFn: async data => {
      const created = await api.post('/shifts/overtime/requests', {
        staff_id: Number(data.staff_id),
        work_date: data.work_date,
        requested_hours: Number(data.requested_hours),
        planned_start: data.planned_start || null,
        planned_end: data.planned_end || null,
        reason: data.reason.trim(),
        compensation_type: data.compensation_type,
      })
      await uploadDocuments(created.data.id, data.files)
      return created.data
    },
    onSuccess: () => {
      invalidateAll()
      setShowForm(false)
      setForm(EMPTY_FORM)
      toastOk('Mesai talebi oluşturuldu')
    },
    onError: toastErr,
  })

  const reviewMut = useMutation({
    mutationFn: data => api.patch(`/shifts/overtime/requests/${data.request.id}`, {
      status: data.status,
      expected_version: data.request.version,
      actual_hours: data.actual_hours === '' ? null : Number(data.actual_hours),
      actual_start: data.actual_start || null,
      actual_end: data.actual_end || null,
      review_note: data.review_note.trim() || null,
    }),
    onSuccess: () => {
      invalidateAll()
      setReview(null)
      toastOk('Mesai talebi güncellendi')
    },
    onError: error => {
      toastErr(error)
      if (error?.response?.status === 409) invalidateAll()
    },
  })

  const uploadMut = useMutation({
    mutationFn: ({ id, files }) => uploadDocuments(id, files),
    onSuccess: () => { invalidateAll(); toastOk('Belge mesai talebine eklendi') },
    onError: toastErr,
  })

  const stats = useMemo(() => {
    const approved = requests.filter(request => request.status === 'approved')
    return {
      pending: requests.filter(request => request.status === 'pending' || request.status === 'returned').length,
      approvedHours: approved.reduce((total, request) => total + Number(request.actual_hours ?? request.requested_hours ?? 0), 0),
      people: new Set(requests.map(request => request.staff_id)).size,
      timeOff: approved.filter(request => request.compensation_type === 'time_off').reduce((total, request) => total + Number(request.actual_hours ?? request.requested_hours ?? 0), 0),
    }
  }, [requests])

  const openReview = (request, status) => setReview({
    request,
    status,
    actual_hours: String(request.actual_hours ?? request.requested_hours ?? ''),
    actual_start: request.actual_start || request.planned_start || '',
    actual_end: request.actual_end || request.planned_end || '',
    review_note: request.review_note || '',
  })

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <input type="month" className="form-input" value={month} onChange={event => setMonth(event.target.value)} style={{ width: 'auto', padding: '5px 11px', fontSize: '12px' }} />
        <select className="form-select" value={deptFilter} onChange={event => setDeptFilter(event.target.value)} style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tüm Bölümler</option>
          {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        {['', 'pending', 'approved', 'returned', 'rejected'].map(status => (
          <button key={status} className={`filter-chip ${statusFilter === status ? 'active' : ''}`} onClick={() => setStatusFilter(status)}>
            {status ? STATUS_META[status].label : 'Tümü'}
          </button>
        ))}
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)} style={{ marginLeft: 'auto' }}>+ Mesai Talebi</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '9px', marginBottom: '18px' }}>
        {[
          ['BEKLEYEN / İADE', stats.pending, 'var(--accent)'],
          ['ONAYLI SAAT', `${stats.approvedHours.toFixed(1)} s`, 'var(--green)'],
          ['TALEP EDEN', stats.people, 'var(--blue)'],
          ['SERBEST ZAMAN', `${stats.timeOff.toFixed(1)} s`, 'var(--purple)'],
        ].map(([label, value, color]) => (
          <div key={label} style={{ padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '5px' }}>{label}</div>
          </div>
        ))}
      </div>

      {summary.length > 0 && (
        <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '10px' }}>
          {summary.map(row => {
            const color = deptColor(row.color_class)
            return <div key={row.dept_id} style={{ minWidth: '150px', padding: '9px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '10px', background: color.bg, color: color.text, fontFamily: 'var(--mono)', fontSize: '8px' }}>{row.dept_name}</span>
              <strong style={{ display: 'block', marginTop: '5px', fontFamily: 'var(--display)', fontSize: '17px' }}>{Number(row.total_hours || 0).toFixed(1)} s</strong>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{row.staff_count} kişi · ödeme kaydı</span>
            </div>
          })}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">MESAİ TALEP VE ONAYLARI</div><div className="panel-subtitle">{requests.length} KAYIT · ÖDEME ONAYDAN SONRA OLUŞUR</div></div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {requests.length === 0 ? (
            <div className="empty-state"><div className="empty-title">MESAİ TALEBİ YOK</div><div className="empty-sub">Bu filtrede kayıt bulunamadı</div></div>
          ) : (
            <table className="data-table responsive-stack">
              <thead><tr><th>Personel</th><th>Tarih</th><th>Plan</th><th>Talep / Gerçek</th><th>Karşılık</th><th>Gerekçe</th><th>Belge</th><th>Durum</th><th>İşlem</th></tr></thead>
              <tbody>
                {requests.map(request => {
                  const color = deptColor(request.dept_color)
                  return <tr key={request.id}>
                    <td data-label="Personel">
                      <button type="button" onClick={() => onPersonClick?.(request.staff_id)} style={{ appearance: 'none', border: 0, background: 'none', color: 'inherit', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ fontWeight: 650 }}>{request.full_name}</div>
                        <span style={{ display: 'inline-block', marginTop: '3px', padding: '2px 7px', borderRadius: '10px', background: color.bg, color: color.text, fontFamily: 'var(--mono)', fontSize: '8px' }}>{request.dept_name || 'Bölümsüz'}</span>
                      </button>
                    </td>
                    <td data-label="Tarih" style={{ fontFamily: 'var(--mono)', fontSize: '10px', whiteSpace: 'nowrap' }}>{formatDate(request.work_date)}</td>
                    <td data-label="Plan" style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{request.planned_start && request.planned_end ? `${request.planned_start}–${request.planned_end}` : 'Saat belirtilmedi'}</td>
                    <td data-label="Talep / Gerçek">
                      <strong style={{ color: 'var(--purple)' }}>{request.requested_hours} s</strong>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: request.actual_hours != null ? 'var(--green)' : 'var(--text3)', marginTop: '3px' }}>Gerçek: {request.actual_hours ?? '—'} s</div>
                    </td>
                    <td data-label="Karşılık"><span className={`badge ${request.compensation_type === 'pay' ? 'badge-green' : 'badge-blue'}`}>{request.compensation_type === 'pay' ? 'Ücret' : 'Serbest zaman'}</span></td>
                    <td data-label="Gerekçe" style={{ maxWidth: '190px', fontSize: '11px', color: 'var(--text2)' }}>
                      {request.reason}
                      {request.review_note && <div style={{ color: 'var(--accent)', fontSize: '9px', marginTop: '4px' }}>Amir: {request.review_note}</div>}
                    </td>
                    <td data-label="Belge">
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {(request.documents || []).map((document, index) => <a key={document.id} className="btn btn-ghost btn-sm" href={documentHref(document.file_url)} target="_blank" rel="noreferrer" title={document.file_name} style={{ padding: '2px 6px', fontSize: '9px' }}>Dosya {index + 1}</a>)}
                        {!request.document_count && <span style={{ color: 'var(--text3)', fontSize: '9px' }}>Yok</span>}
                        <label className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>Ekle<input type="file" multiple accept="image/*,.pdf" hidden onChange={event => {
                          const files = [...event.target.files].slice(0, 5)
                          if (files.length) uploadMut.mutate({ id: request.id, files })
                          event.target.value = ''
                        }} /></label>
                      </div>
                    </td>
                    <td data-label="Durum"><span className={`badge ${STATUS_META[request.status]?.badge || 'badge-gray'}`}>{STATUS_META[request.status]?.label || request.status}</span></td>
                    <td data-label="İşlem">
                      {canEdit && ['pending', 'returned'].includes(request.status) && <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#06130a' }} onClick={() => openReview(request, 'approved')}>Onayla</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openReview(request, 'returned')}>İade</button>
                        <button className="btn btn-danger btn-sm" onClick={() => openReview(request, 'rejected')}>Reddet</button>
                      </div>}
                    </td>
                  </tr>
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '1px', margin: '0 0 16px' }}>YENİ MESAİ TALEBİ</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label className="form-label">Personel</label><StaffSearch value={form.staff_id} onChange={value => setForm(previous => ({ ...previous, staff_id: value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: '10px' }}>
              <div><label className="form-label">Tarih</label><input type="date" className="form-input" value={form.work_date} onChange={event => setForm(previous => ({ ...previous, work_date: event.target.value }))} /></div>
              <div><label className="form-label">Talep saati</label><input type="number" min="0.5" max="12" step="0.5" className="form-input" value={form.requested_hours} onChange={event => setForm(previous => ({ ...previous, requested_hours: event.target.value }))} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div><label className="form-label">Planlanan başlangıç</label><input type="time" className="form-input" value={form.planned_start} onChange={event => setForm(previous => ({ ...previous, planned_start: event.target.value }))} /></div>
              <div><label className="form-label">Planlanan bitiş</label><input type="time" className="form-input" value={form.planned_end} onChange={event => setForm(previous => ({ ...previous, planned_end: event.target.value }))} /></div>
            </div>
            <div>
              <label className="form-label">Karşılık</label>
              <select className="form-select" value={form.compensation_type} onChange={event => setForm(previous => ({ ...previous, compensation_type: event.target.value }))}>
                <option value="pay">Ücret olarak ödenecek</option><option value="time_off">Serbest zaman olarak kullanılacak</option>
              </select>
            </div>
            <div><label className="form-label">Mesai gerekçesi</label><textarea className="form-textarea" rows={2} value={form.reason} onChange={event => setForm(previous => ({ ...previous, reason: event.target.value }))} /></div>
            <div><label className="form-label">Belge / fotoğraf (en fazla 5)</label><input type="file" multiple accept="image/*,.pdf" className="form-input" onChange={event => setForm(previous => ({ ...previous, files: [...event.target.files].slice(0, 5) }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={createMut.isPending || !form.staff_id || !form.work_date || !form.requested_hours || form.reason.trim().length < 3 || (!!form.planned_start !== !!form.planned_end)} onClick={() => createMut.mutate(form)}>
              {createMut.isPending ? 'Kaydediliyor...' : 'Talebi Oluştur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Vazgeç</button>
          </div>
        </ModalOverlay>
      )}

      {review && (
        <ModalOverlay onClose={() => setReview(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px', margin: '0 0 5px' }}>
            {review.status === 'approved' ? 'MESAİ ONAYI' : review.status === 'returned' ? 'MESAİ İADESİ' : 'MESAİ REDDİ'}
          </h3>
          <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '14px' }}>{review.request.full_name} · {formatDate(review.request.work_date)}</div>
          {review.status === 'approved' && <>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: '9px', marginBottom: '12px' }}>
              <div><label className="form-label">Gerçek saat</label><input type="number" min="0" max="12" step="0.5" className="form-input" value={review.actual_hours} onChange={event => setReview(previous => ({ ...previous, actual_hours: event.target.value }))} /></div>
              <div><label className="form-label">Başlangıç</label><input type="time" className="form-input" value={review.actual_start} onChange={event => setReview(previous => ({ ...previous, actual_start: event.target.value }))} /></div>
              <div><label className="form-label">Bitiş</label><input type="time" className="form-input" value={review.actual_end} onChange={event => setReview(previous => ({ ...previous, actual_end: event.target.value }))} /></div>
            </div>
          </>}
          <label className="form-label">Amir notu {review.status === 'approved' ? '(isteğe bağlı)' : '(zorunlu)'}</label>
          <textarea className="form-textarea" rows={3} value={review.review_note} onChange={event => setReview(previous => ({ ...previous, review_note: event.target.value }))} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className={review.status === 'approved' ? 'btn btn-primary' : review.status === 'returned' ? 'btn btn-ghost' : 'btn btn-danger'} style={{ flex: 1 }}
              disabled={reviewMut.isPending || (review.status !== 'approved' && review.review_note.trim().length < 3) || (review.status === 'approved' && (!review.actual_hours || (!!review.actual_start !== !!review.actual_end)))}
              onClick={() => reviewMut.mutate(review)}>{reviewMut.isPending ? 'İşleniyor...' : 'İşlemi Tamamla'}</button>
            <button className="btn btn-ghost" onClick={() => setReview(null)}>Vazgeç</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
