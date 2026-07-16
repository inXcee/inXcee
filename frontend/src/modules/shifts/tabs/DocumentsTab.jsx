import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'

const toast = (message, type = 'success') => useToastStore.getState().addToast(message, type)

const STATUS_TONE = {
  active: { label: 'Geçerli', color: 'var(--green)' },
  expiring: { label: 'Süresi yaklaşan', color: 'var(--accent)' },
  expired: { label: 'Süresi dolmuş', color: 'var(--red)' },
  archived: { label: 'Arşiv', color: 'var(--text3)' },
}

function downloadBlob(res, fileName) {
  const url = URL.createObjectURL(res.data)
  const a = window.document.createElement('a')
  a.href = url; a.download = fileName || 'belge'
  a.click(); URL.revokeObjectURL(url)
}

/* ─── Zorunlu belge kuralları yönetimi (yalnız müdür) ─────────── */
function RequirementsManager({ departments }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['staff-doc-requirements'],
    queryFn: () => api.get('/personnel/document-requirements').then(r => r.data),
    staleTime: 60000,
  })
  const [form, setForm] = useState({ document_kind: 'certificate', display_name: '', department_id: '', requires_expiry: false, visibility: 'operational' })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['staff-doc-requirements'] })

  const create = useMutation({
    mutationFn: () => api.post('/personnel/document-requirements', {
      ...form, department_id: form.department_id || null,
    }),
    onSuccess: () => { invalidate(); toast('Kural eklendi'); setForm(f => ({ ...f, display_name: '' })) },
    onError: (e) => toast(e.response?.data?.error || 'Eklenemedi', 'error'),
  })
  const toggle = async (req) => {
    try { await api.patch(`/personnel/document-requirements/${req.id}`, { is_active: !req.is_active }); invalidate() }
    catch (e) { toast(e.response?.data?.error || 'Hata', 'error') }
  }
  const remove = async (req) => {
    const ok = await confirmDialog({ title: 'Kuralı sil', message: `"${req.display_name}" kuralı silinsin mi?`, confirmText: 'Sil' })
    if (!ok) return
    try { await api.delete(`/personnel/document-requirements/${req.id}`); invalidate(); toast('Kural silindi') }
    catch (e) { toast(e.response?.data?.error || 'Hata', 'error') }
  }

  const requirements = data?.requirements || []
  const kinds = data?.kinds || []
  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel-header"><div className="panel-title">ZORUNLU BELGE KURALLARI</div>
        <div className="panel-subtitle">Hangi belge türü zorunlu · departman/rol kapsamı · süre</div>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        <form onSubmit={(e) => { e.preventDefault(); if (form.display_name.trim()) create.mutate() }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text3)' }}>Belge türü</span>
            <select className="input" value={form.document_kind} onChange={(e) => setForm(f => ({ ...f, document_kind: e.target.value }))}>
              {kinds.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 160 }}>
            <span style={{ fontSize: 9, color: 'var(--text3)' }}>Görünen ad</span>
            <input className="input" value={form.display_name} onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="ör. Yüksekte Çalışma Sertifikası" />
          </label>
          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text3)' }}>Departman</span>
            <select className="input" value={form.department_id} onChange={(e) => setForm(f => ({ ...f, department_id: e.target.value }))}>
              <option value="">Tümü</option>
              {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10 }}>
            <input type="checkbox" checked={form.requires_expiry} onChange={(e) => setForm(f => ({ ...f, requires_expiry: e.target.checked }))} /> Süre zorunlu
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10 }}>
            <input type="checkbox" checked={form.visibility === 'sensitive'} onChange={(e) => setForm(f => ({ ...f, visibility: e.target.checked ? 'sensitive' : 'operational' }))} /> Hassas
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={create.isPending || !form.display_name.trim()}>+ Kural</button>
        </form>

        {requirements.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 620, fontSize: 11 }}>
              <thead><tr><th>AD</th><th>TÜR</th><th>KAPSAM</th><th>SÜRE</th><th>GÖRÜN.</th><th>DURUM</th><th></th></tr></thead>
              <tbody>
                {requirements.map(req => (
                  <tr key={req.id} style={{ opacity: req.is_active ? 1 : 0.5 }}>
                    <td>{req.display_name}</td>
                    <td>{req.kind_label}</td>
                    <td>{req.department_name || req.role_name || 'Tümü'}</td>
                    <td>{req.requires_expiry ? 'Zorunlu' : '—'}</td>
                    <td>{req.visibility === 'sensitive' ? 'Hassas' : 'Op.'}</td>
                    <td><span className={`badge ${req.is_active ? 'badge-green' : 'badge-gray'}`}>{req.is_active ? 'Aktif' : 'Pasif'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggle(req)}>{req.is_active ? 'Pasife al' : 'Aktif et'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(req)} title="Sil">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Tanımlı kural yok. Zorunlu belge türlerini yukarıdan ekleyin.</div>}
      </div>
    </div>
  )
}

/* ─── Genel belge kataloğu (personel + tür + durum filtresi) ─────────── */
export default function DocumentsTab({ departments }) {
  const role = useAuthStore(s => s.user?.role)
  const isManager = role === 'campus_manager'
  const [filter, setFilter] = useState({ q: '', document_kind: '', status: '', staff_id: '', archived: false })

  const staffQuery = useQuery({
    queryKey: ['shifts-staff-min'],
    queryFn: () => api.get('/shifts/staff').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const catalog = useQuery({
    queryKey: ['staff-document-catalog', filter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filter.q) params.set('q', filter.q)
      if (filter.document_kind) params.set('document_kind', filter.document_kind)
      if (filter.status) params.set('status', filter.status)
      if (filter.staff_id) params.set('staff_id', filter.staff_id)
      if (filter.archived) params.set('archived', '1')
      return api.get(`/personnel/documents/catalog?${params.toString()}`).then(r => r.data)
    },
    keepPreviousData: true, staleTime: 20000,
  })

  const download = async (doc) => {
    try {
      const res = await api.get(`/personnel/documents/${doc.id}/download`, { responseType: 'blob' })
      downloadBlob(res, doc.file_name)
    } catch (e) { toast(e.response?.data?.error || 'İndirilemedi', 'error') }
  }

  const docs = catalog.data?.documents || []
  const kinds = catalog.data?.kinds || []
  const statuses = catalog.data?.statuses || []
  const staffList = Array.isArray(staffQuery.data) ? staffQuery.data : (staffQuery.data?.staff || [])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="panel-header"><div className="panel-title">PERSONEL BELGE KATALOĞU</div>
          <div className="panel-subtitle">Personel ve tür bazında belge ara, görüntüle, indir</div>
        </div>
        <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input className="input" placeholder="Ara (ad, başlık, no)" value={filter.q}
              onChange={(e) => setFilter(f => ({ ...f, q: e.target.value }))} style={{ flex: 1, minWidth: 160 }} />
            <select className="input" value={filter.staff_id} onChange={(e) => setFilter(f => ({ ...f, staff_id: e.target.value }))} style={{ width: 180 }}>
              <option value="">Tüm personel</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <select className="input" value={filter.document_kind} onChange={(e) => setFilter(f => ({ ...f, document_kind: e.target.value }))} style={{ width: 150 }}>
              <option value="">Tüm türler</option>
              {kinds.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <select className="input" value={filter.status} onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))} style={{ width: 150 }}>
              <option value="">Tüm durumlar</option>
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10 }}>
              <input type="checkbox" checked={filter.archived} onChange={(e) => setFilter(f => ({ ...f, archived: e.target.checked }))} /> Arşiv dahil
            </label>
          </div>

          {catalog.isLoading ? <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yükleniyor…</div>
            : catalog.isError ? <div style={{ color: 'var(--red)', fontSize: 11 }}>Katalog yüklenemedi.</div>
            : docs.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 780, fontSize: 11 }}>
                  <thead><tr><th>PERSONEL</th><th>DEPARTMAN</th><th>BELGE</th><th>TÜR</th><th>NO</th><th>BİTİŞ</th><th>DURUM</th><th></th></tr></thead>
                  <tbody>
                    {docs.map(doc => {
                      const tone = STATUS_TONE[doc.status] || STATUS_TONE.active
                      return (
                        <tr key={doc.id}>
                          <td>{doc.staff_name}</td>
                          <td>{doc.department_name || '—'}</td>
                          <td>{doc.title}{doc.visibility === 'sensitive' && <span style={{ marginLeft: 5, color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 7 }}>HASSAS</span>}</td>
                          <td>{doc.kind_label}</td>
                          <td>{doc.document_no || '—'}</td>
                          <td>{doc.expires_on || '—'}</td>
                          <td><span style={{ color: tone.color, fontFamily: 'var(--mono)', fontSize: 9 }}>{tone.label}</span></td>
                          <td>
                            {doc.restricted
                              ? <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text4)' }}>YETKİ YOK</span>
                              : <button className="btn btn-ghost btn-sm" onClick={() => download(doc)} title="İndir">⬇</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, marginTop: 6 }}>{docs.length} belge</div>
              </div>
            ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Bu filtrede belge bulunmuyor.</div>}
        </div>
      </div>

      {isManager && <RequirementsManager departments={departments} />}
    </div>
  )
}
