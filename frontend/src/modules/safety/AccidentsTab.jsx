import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

const SEVERITIES = {
  none: { label: 'Yaralanma yok', color: 'var(--text4)' },
  first_aid: { label: 'İlk yardım', color: 'var(--amber)' },
  medical: { label: 'Tıbbi müdahale', color: 'var(--accent)' },
  lost_time: { label: 'İş günü kayıplı', color: 'var(--red)' },
  fatal: { label: 'Ölümlü', color: '#7f1d1d' },
}
const STATUSES = {
  open: { label: 'Açık', color: 'var(--red)' },
  investigating: { label: 'İnceleniyor', color: 'var(--amber)' },
  closed: { label: 'Kapatıldı', color: 'var(--green)' },
}

const EMPTY_FORM = {
  staff_id: '', staff_name: '', accident_date: '', accident_time: '', location: '',
  description: '', injury_type: '', body_part: '', severity: 'first_aid', lost_days: '',
}

export default function AccidentsTab() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState({ status: '', severity: '' })
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [staffSearch, setStaffSearch] = useState('')

  const { data: accidents = [], isLoading } = useQuery({
    queryKey: ['accidents', filters],
    queryFn: () => api.get('/safety/accidents', {
      params: { status: filters.status || undefined, severity: filters.severity || undefined },
    }).then(r => r.data),
  })
  const { data: staffResults = [] } = useQuery({
    queryKey: ['staff-search', staffSearch],
    queryFn: () => api.get(`/shifts/staff/search?q=${encodeURIComponent(staffSearch)}`).then(r => r.data),
    enabled: staffSearch.length >= 2,
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/safety/accidents', {
      ...form, staff_id: +form.staff_id, lost_days: form.lost_days ? +form.lost_days : 0,
    }),
    onSuccess: () => {
      toast('Kaza kaydı oluşturuldu')
      setForm(EMPTY_FORM); setCreating(false); setStaffSearch('')
      qc.invalidateQueries({ queryKey: ['accidents'] })
    },
    onError: toastErr,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <select className="form-select" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={{ fontSize: 11, width: 'auto' }}>
            <option value="">Tüm durumlar</option>
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="form-select" value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))} style={{ fontSize: 11, width: 'auto' }}>
            <option value="">Tüm şiddetler</option>
            {Object.entries(SEVERITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <button onClick={() => setCreating(c => !c)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>
          {creating ? '✕ VAZGEÇ' : '+ KAZA KAYDI'}
        </button>
      </div>

      {creating && (
        <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 10 }}>+ YENİ İŞ KAZASI KAYDI</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <div>
              <input className="form-input" placeholder="Kazazede ara…*" value={form.staff_name || staffSearch}
                onChange={e => { setStaffSearch(e.target.value); setForm(f => ({ ...f, staff_id: '', staff_name: '' })) }} style={{ fontSize: 12 }} />
              {!form.staff_id && staffSearch.length >= 2 && (
                <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {staffResults.map(s => (
                    <button key={s.id} onClick={() => { setForm(f => ({ ...f, staff_id: s.id, staff_name: s.full_name })); setStaffSearch('') }}
                      style={{ padding: '4px 8px', textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                      {s.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input className="form-input" type="date" value={form.accident_date}
              onChange={e => setForm(f => ({ ...f, accident_date: e.target.value }))} style={{ fontSize: 12 }} />
            <input className="form-input" type="time" value={form.accident_time}
              onChange={e => setForm(f => ({ ...f, accident_time: e.target.value }))} style={{ fontSize: 12 }} />
            <input className="form-input" placeholder="Kaza yeri" value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={{ fontSize: 12 }} />
            <select className="form-select" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} style={{ fontSize: 12 }}>
              {Object.entries(SEVERITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input className="form-input" placeholder="Yaralanma türü" value={form.injury_type}
              onChange={e => setForm(f => ({ ...f, injury_type: e.target.value }))} style={{ fontSize: 12 }} />
            <input className="form-input" placeholder="Etkilenen uzuv" value={form.body_part}
              onChange={e => setForm(f => ({ ...f, body_part: e.target.value }))} style={{ fontSize: 12 }} />
            <input className="form-input" type="number" min="0" placeholder="Kayıp iş günü" value={form.lost_days}
              onChange={e => setForm(f => ({ ...f, lost_days: e.target.value }))} style={{ fontSize: 12 }} />
          </div>
          <textarea className="form-textarea" placeholder="Kaza tanımı (nasıl oldu?)*" value={form.description} rows={3}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            style={{ fontSize: 12, marginTop: 8, width: '100%' }} />
          <button onClick={() => createMut.mutate()}
            disabled={!form.staff_id || !form.accident_date || !form.description || createMut.isPending}
            className="btn btn-primary btn-sm" style={{ borderRadius: 8, marginTop: 8 }}>KAYDET</button>
        </div>
      )}

      {isLoading ? <div style={{ padding: 30, color: 'var(--text3)' }}>Yükleniyor…</div> : !accidents.length ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>🦺</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>KAZA KAYDI YOK</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {accidents.map(a => (
            <div key={a.id} onClick={() => setOpenId(a.id)} style={{
              padding: 14, borderRadius: 12, cursor: 'pointer',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: `4px solid ${SEVERITIES[a.severity]?.color || 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: SEVERITIES[a.severity]?.color }}>{SEVERITIES[a.severity]?.label}</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 8, background: 'var(--surface2)', color: STATUSES[a.status]?.color }}>
                  {STATUSES[a.status]?.label}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{a.full_name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                📅 {a.accident_date}{a.accident_time ? ` ${a.accident_time}` : ''} {a.location ? `· 📍 ${a.location}` : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 6 }}>
                👁 {a.witness_count} tanık · 📷 {a.photo_count} foto{a.lost_days > 0 ? ` · ⏸ ${a.lost_days}g kayıp` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {openId && <AccidentDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function AccidentDetail({ id, onClose }) {
  const qc = useQueryClient()
  const [witness, setWitness] = useState({ full_name: '', statement: '' })

  const { data: a, isLoading } = useQuery({
    queryKey: ['accident', id],
    queryFn: () => api.get(`/safety/accidents/${id}`).then(r => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accident', id] })
    qc.invalidateQueries({ queryKey: ['accidents'] })
  }
  const updateMut = useMutation({
    mutationFn: (data) => api.put(`/safety/accidents/${id}`, data),
    onSuccess: () => { toast('Güncellendi'); invalidate() },
    onError: toastErr,
  })
  const witnessMut = useMutation({
    mutationFn: () => api.post(`/safety/accidents/${id}/witnesses`, witness),
    onSuccess: () => { setWitness({ full_name: '', statement: '' }); invalidate() },
    onError: toastErr,
  })
  const delWitnessMut = useMutation({
    mutationFn: (wid) => api.delete(`/safety/accidents/witnesses/${wid}`),
    onSuccess: invalidate, onError: toastErr,
  })
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/safety/accidents/${id}`),
    onSuccess: () => { toast('Kaza kaydı silindi'); onClose(); qc.invalidateQueries({ queryKey: ['accidents'] }) },
    onError: toastErr,
  })

  async function uploadPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('photo', file)
    try {
      await api.post(`/safety/accidents/${id}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast('Fotoğraf yüklendi'); invalidate()
    } catch (err) { toastErr(err) }
    e.target.value = ''
  }

  async function downloadPdf() {
    try {
      const res = await api.get(`/safety/accidents/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `is-kazasi-${id}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch { toast('PDF indirilemedi', 'error') }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(480px, 100vw)', height: '100%', overflowY: 'auto',
        background: 'var(--bg)', borderLeft: '1px solid var(--border)', padding: 20,
      }}>
        {isLoading || !a ? <div style={{ color: 'var(--text3)' }}>Yükleniyor…</div> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5 }}>KAZA-{a.id}</div>
                <h2 style={{ fontSize: 18, margin: '4px 0 0' }}>{a.full_name}</h2>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                  {a.dept_name || '—'} · {a.position || '—'}
                </div>
              </div>
              <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {Object.entries(STATUSES).map(([k, v]) => (
                <button key={k} onClick={() => updateMut.mutate({ status: k })} disabled={a.status === k}
                  className="btn btn-ghost btn-xs" style={{
                    borderRadius: 8, border: `1px solid ${a.status === k ? v.color : 'var(--border)'}`,
                    color: a.status === k ? v.color : 'var(--text3)',
                  }}>{v.label}</button>
              ))}
              <button onClick={downloadPdf} className="btn btn-primary btn-xs" style={{ borderRadius: 8 }}>📄 PDF</button>
            </div>

            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12, fontSize: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>
                📅 {a.accident_date}{a.accident_time ? ` ${a.accident_time}` : ''} · 📍 {a.location || '—'} · {SEVERITIES[a.severity]?.label}
              </div>
              <div>{a.description}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
                Yaralanma: {a.injury_type || '—'} · Uzuv: {a.body_part || '—'} · Kayıp gün: {a.lost_days || 0}
              </div>
              {a.actions_taken && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text2)' }}>🛠 {a.actions_taken}</div>}
            </div>

            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5 }}>SGK BİLDİRİMİ</div>
                <button onClick={() => updateMut.mutate({ sgk_reported: a.sgk_reported ? 0 : 1, sgk_report_date: a.sgk_reported ? '' : new Date().toISOString().slice(0, 10) })}
                  className="btn btn-ghost btn-xs" style={{ color: a.sgk_reported ? 'var(--green)' : 'var(--red)' }}>
                  {a.sgk_reported ? `✓ Yapıldı${a.sgk_report_date ? ` (${a.sgk_report_date})` : ''}` : '✗ Yapılmadı — işaretle'}
                </button>
              </div>
            </div>

            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
                TANIKLAR ({a.witnesses.length})
              </div>
              {a.witnesses.map(w => (
                <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                  <div>
                    <strong>{w.full_name}</strong>
                    {w.statement && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{w.statement}</div>}
                  </div>
                  <button onClick={() => delWitnessMut.mutate(w.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="form-input" placeholder="Tanık adı" value={witness.full_name}
                  onChange={e => setWitness(w => ({ ...w, full_name: e.target.value }))} style={{ fontSize: 11, flex: 1 }} />
                <input className="form-input" placeholder="İfade" value={witness.statement}
                  onChange={e => setWitness(w => ({ ...w, statement: e.target.value }))} style={{ fontSize: 11, flex: 2 }} />
                <button onClick={() => witnessMut.mutate()} disabled={!witness.full_name || witnessMut.isPending}
                  className="btn btn-primary btn-xs" style={{ borderRadius: 8 }}>+</button>
              </div>
            </div>

            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5 }}>
                  FOTOĞRAFLAR ({a.photos.length})
                </div>
                <label className="btn btn-ghost btn-xs" style={{ cursor: 'pointer', borderRadius: 8 }}>
                  📷 EKLE
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} style={{ display: 'none' }} />
                </label>
              </div>
              {a.photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {a.photos.map(p => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                      <img src={p.url} alt="Kaza fotoğrafı" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>

            <button onClick={async () => {
              if (await confirmDialog({ title: 'Kaydı Sil', body: 'Kaza kaydı, tanıklar ve fotoğraflar silinecek.', confirmLabel: 'Sil' })) deleteMut.mutate()
            }} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', width: '100%', borderRadius: 10 }}>
              KAYDI SİL
            </button>
          </>
        )}
      </div>
    </div>
  )
}
