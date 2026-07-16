import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { DossierSection, DossierMetric, formatDossierDate } from './StaffDossierShared.jsx'

const toast = (message, type = 'success') => useToastStore.getState().addToast(message, type)

const STATUS_TONE = {
  active: { label: 'Geçerli', color: 'var(--green)' },
  expiring: { label: 'Süresi yaklaşıyor', color: 'var(--accent)' },
  expired: { label: 'Süresi dolmuş', color: 'var(--red)' },
  archived: { label: 'Arşiv', color: 'var(--text3)' },
}

export function useStaffDocuments(staffId, enabled = true) {
  return useQuery({
    queryKey: ['staff-documents', String(staffId)],
    queryFn: () => api.get(`/personnel/${staffId}/documents`).then(r => r.data),
    enabled: !!staffId && enabled,
    staleTime: 30000,
  })
}

function UploadForm({ staffId, kinds, canSensitive, onDone }) {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [form, setForm] = useState({ document_kind: 'other', title: '', document_no: '', issued_on: '', expires_on: '', visibility: 'operational' })
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => {
      const file = fileRef.current?.files?.[0]
      if (!file) throw new Error('Dosya seçilmedi')
      const data = new FormData()
      data.append('file', file)
      Object.entries(form).forEach(([key, value]) => { if (value) data.append(key, value) })
      return api.post(`/personnel/${staffId}/documents`, data).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-documents', String(staffId)] })
      qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
      toast('Belge yüklendi')
      setForm({ document_kind: 'other', title: '', document_no: '', issued_on: '', expires_on: '', visibility: 'operational' })
      if (fileRef.current) fileRef.current.value = ''
      onDone?.()
    },
    onError: (error) => toast(error.response?.data?.error || error.message || 'Yükleme başarısız', 'error'),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>Belge türü</span>
          <select className="input" value={form.document_kind} onChange={(e) => set('document_kind', e.target.value)}>
            {kinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>Başlık</span>
          <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Belge adı" />
        </label>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>Belge no</span>
          <input className="input" value={form.document_no} onChange={(e) => set('document_no', e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>Düzenlenme</span>
          <input type="date" className="input" value={form.issued_on} onChange={(e) => set('issued_on', e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>Bitiş</span>
          <input type="date" className="input" value={form.expires_on} onChange={(e) => set('expires_on', e.target.value)} />
        </label>
        {canSensitive && (
          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text3)' }}>Görünürlük</span>
            <select className="input" value={form.visibility} onChange={(e) => set('visibility', e.target.value)}>
              <option value="operational">Operasyonel</option>
              <option value="sensitive">Hassas</option>
            </select>
          </label>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" style={{ fontSize: 11 }} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={mutation.isPending}>
          {mutation.isPending ? 'Yükleniyor…' : '⬆ Belge Yükle'}
        </button>
      </div>
    </form>
  )
}

function DocumentRow({ document, staffId, canManage }) {
  const qc = useQueryClient()
  const tone = STATUS_TONE[document.status] || STATUS_TONE.active
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff-documents', String(staffId)] })
    qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
  }
  const download = async () => {
    try {
      const res = await api.get(`/personnel/documents/${document.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = window.document.createElement('a')
      a.href = url; a.download = document.file_name || 'belge'
      a.click(); URL.revokeObjectURL(url)
    } catch (error) {
      toast(error.response?.data?.error || 'İndirilemedi', 'error')
    }
  }
  const archive = async () => {
    const ok = await confirmDialog({ title: 'Belgeyi arşivle', message: `"${document.title}" arşivlensin mi?`, confirmText: 'Arşivle' })
    if (!ok) return
    try {
      await api.post(`/personnel/documents/${document.id}/archive`)
      toast('Belge arşivlendi'); invalidate()
    } catch (error) {
      toast(error.response?.data?.error || 'Arşivlenemedi', 'error')
    }
  }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center',
      padding: '9px 10px', borderRadius: 8, background: 'var(--surface2)',
      borderLeft: `3px solid ${tone.color}`, opacity: document.status === 'archived' ? 0.65 : 1,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {document.title}
          {document.visibility === 'sensitive' && <span style={{ marginLeft: 6, color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 7 }}>HASSAS</span>}
          {document.read_only && <span style={{ marginLeft: 6, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 7 }}>SALT OKUNUR</span>}
        </div>
        <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, marginTop: 3 }}>
          {document.kind_label}{document.document_no ? ` · ${document.document_no}` : ''}
          {document.expires_on ? ` · bitiş ${document.expires_on}` : ''} · {formatDossierDate(document.uploaded_at)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: tone.color }}>{tone.label}</span>
        {document.restricted ? (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text4)' }}>YETKİ YOK</span>
        ) : document.read_only ? null : (
          <>
            <button className="btn btn-ghost btn-sm" onClick={download} title="İndir">⬇</button>
            {canManage && document.status !== 'archived' && (
              <button className="btn btn-ghost btn-sm" onClick={archive} title="Arşivle">🗄</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function StaffDocumentsPanel({ staffId, access, compact = false }) {
  const { data, isLoading, error } = useStaffDocuments(staffId)
  const [showUpload, setShowUpload] = useState(false)
  const canManage = access?.can_manage_operational_documents
  const canSensitive = access?.can_manage_sensitive_documents

  const activeDocs = useMemo(
    () => (data?.documents || []).filter(d => d.status !== 'archived'),
    [data],
  )
  const archivedDocs = useMemo(
    () => (data?.documents || []).filter(d => d.status === 'archived'),
    [data],
  )
  const [showArchived, setShowArchived] = useState(false)

  if (isLoading) return <div style={{ color: 'var(--text3)', fontSize: 11 }}>Belgeler yükleniyor…</div>
  if (error) return <div style={{ color: 'var(--red)', fontSize: 11 }}>Belgeler yüklenemedi: {error.response?.data?.error || error.message}</div>

  const summary = data?.summary || {}
  const missingReqs = (data?.requirements || []).filter(r => !r.satisfied)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!compact && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          <DossierMetric label="AKTİF" value={summary.active || 0} />
          <DossierMetric label="EKSİK ZORUNLU" value={summary.missing || 0} color={summary.missing ? 'var(--red)' : 'var(--green)'} />
          <DossierMetric label="SÜRESİ DOLMUŞ" value={summary.expired || 0} color={summary.expired ? 'var(--red)' : 'var(--green)'} />
          <DossierMetric label="YAKLAŞAN" value={summary.expiring || 0} color={summary.expiring ? 'var(--accent)' : 'var(--text3)'} />
          <DossierMetric label="EK (İZİN/MESAİ)" value={summary.attachments || 0} color="var(--blue)" />
        </div>
      )}

      {missingReqs.length > 0 && (
        <div style={{ padding: '9px 11px', borderRadius: 8, background: 'rgba(240,165,0,.08)', border: '1px solid rgba(240,165,0,.25)' }}>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--mono)', marginBottom: 5 }}>EKSİK ZORUNLU BELGELER</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {missingReqs.map(req => <span key={req.id} className="badge badge-amber">{req.display_name}</span>)}
          </div>
        </div>
      )}

      {canManage && (
        <DossierSection title="BELGE YÜKLE" subtitle="PDF, resim veya Office · max 20 MB"
          action={<button className="btn btn-ghost btn-sm" onClick={() => setShowUpload(v => !v)}>{showUpload ? 'Gizle' : '+ Yeni belge'}</button>}>
          {showUpload
            ? <UploadForm staffId={staffId} kinds={data?.kinds || []} canSensitive={canSensitive} onDone={() => setShowUpload(false)} />
            : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yeni belge eklemek için "+ Yeni belge".</div>}
        </DossierSection>
      )}

      <DossierSection title="BELGELER" subtitle={`${activeDocs.length} aktif belge`}>
        {activeDocs.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {activeDocs.map(doc => <DocumentRow key={doc.id} document={doc} staffId={staffId} canManage={canManage} />)}
          </div>
        ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Kayıtlı belge bulunmuyor.</div>}
      </DossierSection>

      {(data?.attachments || []).length > 0 && (
        <DossierSection title="İZİN / MESAİ / PUANTAJ EKLERİ" subtitle="Salt okunur — kaynak modülden gelir">
          <div style={{ display: 'grid', gap: 6 }}>
            {data.attachments.map(doc => <DocumentRow key={doc.id} document={doc} staffId={staffId} canManage={false} />)}
          </div>
        </DossierSection>
      )}

      {archivedDocs.length > 0 && (
        <DossierSection title="ARŞİV" subtitle={`${archivedDocs.length} arşivlenmiş belge`}
          action={<button className="btn btn-ghost btn-sm" onClick={() => setShowArchived(v => !v)}>{showArchived ? 'Gizle' : 'Göster'}</button>}>
          {showArchived ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {archivedDocs.map(doc => <DocumentRow key={doc.id} document={doc} staffId={staffId} canManage={canManage} />)}
            </div>
          ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>{archivedDocs.length} arşivlenmiş belge gizli.</div>}
        </DossierSection>
      )}
    </div>
  )
}
