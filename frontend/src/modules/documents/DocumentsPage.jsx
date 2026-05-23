import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import EmptyState from '../../shared/components/EmptyState.jsx'
import { exportRowsToCsv } from '../../shared/utils/exportData.js'

const CATEGORIES = [
  { value: 'contract', label: 'Sözleşme' },
  { value: 'invoice', label: 'Fatura' },
  { value: 'insurance', label: 'Sigorta' },
  { value: 'id_doc', label: 'Kimlik/Belge' },
  { value: 'report', label: 'Rapor' },
  { value: 'other', label: 'Diğer' },
]

const RELATED = [
  { value: 'none', label: '—' },
  { value: 'company', label: 'Firma' },
  { value: 'personnel', label: 'Personel' },
  { value: 'room', label: 'Oda' },
]

function fmt(b) {
  if (!b) return '-'
  const units = ['B', 'KB', 'MB']
  let i = 0, n = b
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(1)} ${units[i]}`
}

export default function DocumentsPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [filter, setFilter] = useState({ category: '', q: '' })
  const [showUpload, setShowUpload] = useState(false)
  const [form, setForm] = useState({
    category: 'contract', title: '', related_type: 'none', related_id: '', description: '',
  })
  const fileRef = useRef(null)
  const [fileName, setFileName] = useState('')

  const params = new URLSearchParams()
  if (filter.category) params.set('category', filter.category)
  if (filter.q) params.set('q', filter.q)

  const { data: rows = [] } = useQuery({
    queryKey: ['documents', params.toString()],
    queryFn: () => api.get(`/documents?${params}`).then(r => r.data),
  })

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', fileRef.current.files[0])
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v))
      return api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      setShowUpload(false)
      setForm({ category: 'contract', title: '', related_type: 'none', related_id: '', description: '' })
      setFileName('')
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast({ kind: 'success', text: 'Belge yüklendi' })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Yükleme hatası' }),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast({ kind: 'success', text: 'Silindi' }) },
  })

  async function handleDelete(d) {
    const ok = await confirmDialog({ title: 'Belge sil', body: `"${d.title}" silinsin mi? Dosya da kalıcı silinir.`, danger: true })
    if (ok) delMut.mutate(d.id)
  }

  async function handleDownload(id) {
    const res = await api.get(`/documents/${id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: 4 }}>BELGELER</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
            SOZLESME · FATURA · SIGORTA · KIMLIK · RAPOR
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(s => !s)}>+ BELGE YÜKLE</button>
      </div>

      {showUpload && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ height: 2, background: 'var(--accent)' }} />
          <div className="panel-header"><div className="panel-title">YENİ BELGE</div></div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label className="form-label">KATEGORİ *</label>
                <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">BAŞLIK *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">İLGİLİ TİP</label>
                <select className="form-select" value={form.related_type} onChange={e => setForm(f => ({ ...f, related_type: e.target.value }))}>
                  {RELATED.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {form.related_type !== 'none' && (
                <div>
                  <label className="form-label">İLGİLİ ID</label>
                  <input className="form-input" type="number" value={form.related_id} onChange={e => setForm(f => ({ ...f, related_id: e.target.value }))} placeholder="firma/personel/oda id" />
                </div>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">AÇIKLAMA</label>
              <textarea className="form-input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">DOSYA * (PDF, JPG, PNG, DOC, XLSX — max 20MB)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                onChange={e => setFileName(e.target.files[0]?.name || '')}
                style={{
                  padding: 8, background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
                }}
              />
              {fileName && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Seçildi: {fileName}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" disabled={!fileName || !form.title || uploadMut.isPending} onClick={() => uploadMut.mutate()}>
                {uploadMut.isPending ? 'YÜKLENİYOR...' : 'YÜKLE'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowUpload(false); setFileName('') }}>İPTAL</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="panel-title">BELGELER ({rows.length})</div>
          <div style={{ flex: 1 }} />
          <select className="form-select" style={{ width: 140 }} value={filter.category} onChange={e => setFilter(f => ({ ...f, category: e.target.value }))}>
            <option value="">Tüm kategoriler</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input className="form-input" style={{ width: 200 }} placeholder="Ara..." value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} />
          {rows.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => exportRowsToCsv([
              { key: 'title', label: 'BAŞLIK' },
              { key: 'category', label: 'KATEGORİ' },
              { key: 'file_name', label: 'DOSYA ADI' },
              { key: 'expires_at', label: 'SON GEÇERLİLİK' },
              { key: 'uploaded_by_name', label: 'YÜKLEYEN' },
              { key: 'created_at', label: 'YÜKLEME TARİHİ' },
            ], rows, 'belgeler.csv')}>↓ CSV</button>
          )}
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <EmptyState icon="📄" title="Belge yok" hint="İlk belgenizi yüklemek için 'Belge Yükle' butonunu kullanın" />
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 8 }}>Başlık</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Kategori</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Dosya</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Boyut</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>İlgili</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Yüklenme</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(d => {
                    const cat = CATEGORIES.find(c => c.value === d.category)
                    return (
                      <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 8 }}>
                          <strong>{d.title}</strong>
                          {d.description && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{d.description}</div>}
                        </td>
                        <td style={{ padding: 8, fontSize: 11 }}>{cat?.label || d.category}</td>
                        <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{d.file_name}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt(d.size_bytes)}</td>
                        <td style={{ padding: 8, fontSize: 11 }}>
                          {d.related_type !== 'none' ? `${RELATED.find(r => r.value === d.related_type)?.label} #${d.related_id}` : '-'}
                        </td>
                        <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>
                          {new Date(d.uploaded_at).toLocaleDateString('tr-TR')}
                          {d.uploaded_by_name && <div style={{ fontSize: 9, color: 'var(--text3)' }}>{d.uploaded_by_name}</div>}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(d.id)}>↓ İndir</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(d)} style={{ color: 'var(--red, #ef4444)' }}>Sil</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
