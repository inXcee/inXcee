import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { DossierSection, DossierMetric, formatDossierDate } from './StaffDossierShared.jsx'

const toast = (message, type = 'success') => useToastStore.getState().addToast(message, type)

export function useStaffUniform(staffId, enabled = true) {
  return useQuery({
    queryKey: ['staff-uniform', String(staffId)],
    queryFn: () => api.get(`/personnel/${staffId}/uniform`).then(r => r.data),
    enabled: !!staffId && enabled,
    staleTime: 30000,
  })
}

/* ─── Tür kataloğu yönetimi (yalnız müdür) ─────────── */
function UniformCatalog({ staffId }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['uniform-items'],
    queryFn: () => api.get('/personnel/uniform/items').then(r => r.data),
    enabled: open, staleTime: 60000,
  })
  const [form, setForm] = useState({ label: '', category: 'clothing', size_kind: 'text' })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['uniform-items'] })
    qc.invalidateQueries({ queryKey: ['staff-uniform', String(staffId)] })
  }
  const create = useMutation({
    mutationFn: () => api.post('/personnel/uniform/items', form),
    onSuccess: () => { invalidate(); toast('Tür eklendi'); setForm(f => ({ ...f, label: '' })) },
    onError: (e) => toast(e.response?.data?.error || 'Eklenemedi', 'error'),
  })
  const toggle = async (item) => {
    try { await api.patch(`/personnel/uniform/items/${item.id}`, { is_active: !item.is_active }); invalidate() }
    catch (e) { toast(e.response?.data?.error || 'Hata', 'error') }
  }
  const remove = async (item) => {
    const ok = await confirmDialog({ title: 'Türü sil', message: `"${item.label}" silinsin mi? (kullanılıyorsa pasife alınır)`, confirmText: 'Sil' })
    if (!ok) return
    try { const r = await api.delete(`/personnel/uniform/items/${item.id}`); invalidate(); toast(r.data.deactivated ? 'Tür pasife alındı' : 'Tür silindi') }
    catch (e) { toast(e.response?.data?.error || 'Hata', 'error') }
  }
  const items = data?.items || []
  const categories = data?.categories || []
  return (
    <DossierSection title="KIYAFET/EKİPMAN TÜRLERİ" subtitle="Tür kataloğunu yönet (müdür)"
      action={<button className="btn btn-ghost btn-sm" onClick={() => setOpen(v => !v)}>{open ? 'Gizle' : 'Yönet'}</button>}>
      {!open ? <div style={{ color: 'var(--text3)', fontSize: 11 }}>Kıyafet/ekipman türlerini eklemek veya düzenlemek için "Yönet".</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          <form onSubmit={(e) => { e.preventDefault(); if (form.label.trim()) create.mutate() }} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'end' }}>
            <input className="input" placeholder="Tür adı (ör. Kışlık Mont)" value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} style={{ flex: 1, minWidth: 140 }} />
            <select className="input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: 120 }}>
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select className="input" value={form.size_kind} onChange={(e) => setForm(f => ({ ...f, size_kind: e.target.value }))} style={{ width: 110 }}>
              <option value="text">Beden (metin)</option><option value="numeric">Numara</option><option value="none">Bedensiz</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm" disabled={create.isPending || !form.label.trim()}>+ Tür</button>
          </form>
          <div style={{ display: 'grid', gap: 4 }}>
            {items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 7, background: 'var(--surface2)', opacity: item.is_active ? 1 : 0.5, fontSize: 11 }}>
                <span>{item.label} <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8 }}>· {item.category} · {item.size_kind}</span></span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(item)}>{item.is_active ? 'Pasife al' : 'Aktif et'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(item)} title="Sil">🗑</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </DossierSection>
  )
}

export default function StaffUniformPanel({ staffId, access, enabled = true }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useStaffUniform(staffId, enabled)
  const canManage = access?.can_manage_followups
  const isManager = access?.can_view_sensitive_fields
  const [sizes, setSizes] = useState({})
  const [dirty, setDirty] = useState(false)
  const [issueForm, setIssueForm] = useState({ item_key: '', size: '', quantity: 1, note: '' })

  const items = useMemo(() => data?.items || [], [data])
  // Sunucu bedenlerini yerel forma yükle — ancak kaydedilmemiş düzenleme (dirty)
  // varsa ezme: zimmet ver/iade veya arka plan refetch'i kullanıcının girdiğini silmesin.
  useEffect(() => {
    if (!data || dirty) return
    const next = {}
    for (const item of data.items) next[item.item_key] = { size: item.size || '', note: item.note || '' }
    setSizes(next)
  }, [data, dirty])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff-uniform', String(staffId)] })
    qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
  }
  const saveSizes = useMutation({
    mutationFn: () => api.put(`/personnel/${staffId}/uniform/sizes`, {
      sizes: Object.entries(sizes).map(([item_key, v]) => ({ item_key, size: v.size, note: v.note })),
    }),
    onSuccess: () => { invalidate(); toast('Bedenler kaydedildi'); setDirty(false) },
    onError: (e) => toast(e.response?.data?.error || 'Kaydedilemedi', 'error'),
  })
  const issue = useMutation({
    mutationFn: () => api.post(`/personnel/${staffId}/uniform/issue`, { ...issueForm, quantity: issueForm.quantity || 1 }),
    onSuccess: () => { invalidate(); toast('Zimmet verildi'); setIssueForm({ item_key: '', size: '', quantity: 1, note: '' }) },
    onError: (e) => toast(e.response?.data?.error || 'Zimmet verilemedi', 'error'),
  })
  const returnIssue = async (row) => {
    const ok = await confirmDialog({ title: 'Zimmet iadesi', message: `"${row.label}" (${row.quantity} adet) iade alınsın mı?`, confirmText: 'İade Al' })
    if (!ok) return
    try { await api.post(`/personnel/uniform/issues/${row.id}/return`); invalidate(); toast('İade alındı') }
    catch (e) { toast(e.response?.data?.error || 'Hata', 'error') }
  }

  const setSize = (key, field, value) => {
    setSizes(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
    setDirty(true)
  }

  if (isLoading) return <div style={{ color: 'var(--text3)', fontSize: 11 }}>Kıyafet bilgileri yükleniyor…</div>
  if (error) return <div style={{ color: 'var(--red)', fontSize: 11 }}>Kıyafet bilgileri yüklenemedi.</div>

  const issues = data?.issues || []
  const summary = data?.summary || {}

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
        <DossierMetric label="TÜR" value={summary.total_types || 0} />
        <DossierMetric label="BEDEN GİRİLİ" value={summary.sized || 0} color="var(--blue)" />
        <DossierMetric label="AKTİF ZİMMET" value={summary.active_issues || 0} color={summary.active_issues ? 'var(--accent)' : 'var(--green)'} />
      </div>

      <DossierSection title="KIYAFET VE BEDENLER" subtitle="İş pantolonu, tişört, ayakkabı numarası vb."
        action={canManage && dirty ? <button className="btn btn-primary btn-sm" onClick={() => saveSizes.mutate()} disabled={saveSizes.isPending}>{saveSizes.isPending ? 'Kaydediliyor…' : '💾 Bedenleri Kaydet'}</button> : null}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 520, fontSize: 11 }}>
            <thead><tr><th>TÜR</th><th>KATEGORİ</th><th>BEDEN / NUMARA</th><th>NOT</th><th>ZİMMET</th></tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.item_key}>
                  <td>{item.label}</td>
                  <td><span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{item.category_label}</span></td>
                  <td>
                    {item.size_kind === 'none' ? <span style={{ color: 'var(--text4)' }}>—</span> : canManage ? (
                      <input className="input" style={{ width: 90, padding: '3px 6px' }}
                        type={item.size_kind === 'numeric' ? 'number' : 'text'}
                        value={sizes[item.item_key]?.size ?? ''}
                        onChange={(e) => setSize(item.item_key, 'size', e.target.value)}
                        placeholder={item.size_kind === 'numeric' ? 'No' : 'Beden'} />
                    ) : (item.size || '—')}
                  </td>
                  <td>
                    {canManage ? (
                      <input className="input" style={{ width: 130, padding: '3px 6px' }}
                        value={sizes[item.item_key]?.note ?? ''}
                        onChange={(e) => setSize(item.item_key, 'note', e.target.value)} placeholder="not" />
                    ) : (item.note || '—')}
                  </td>
                  <td>{item.active_quantity > 0 ? <span className="badge badge-amber">{item.active_quantity} adet</span> : <span style={{ color: 'var(--text4)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DossierSection>

      <DossierSection title="ZİMMET (TESLİM/İADE)" subtitle={`${issues.filter(i => !i.returned_at).length} aktif · ${issues.length} toplam`}>
        {canManage && (
          <form onSubmit={(e) => { e.preventDefault(); if (issueForm.item_key) issue.mutate() }} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'end' }}>
            <select className="input" value={issueForm.item_key} onChange={(e) => setIssueForm(f => ({ ...f, item_key: e.target.value }))} style={{ minWidth: 140 }}>
              <option value="">Tür seç…</option>
              {items.map(item => <option key={item.item_key} value={item.item_key}>{item.label}</option>)}
            </select>
            <input className="input" placeholder="Beden" value={issueForm.size} onChange={(e) => setIssueForm(f => ({ ...f, size: e.target.value }))} style={{ width: 80 }} />
            <input className="input" type="number" min="1" value={issueForm.quantity} onChange={(e) => setIssueForm(f => ({ ...f, quantity: +e.target.value }))} style={{ width: 64 }} />
            <input className="input" placeholder="Not" value={issueForm.note} onChange={(e) => setIssueForm(f => ({ ...f, note: e.target.value }))} style={{ flex: 1, minWidth: 100 }} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={issue.isPending || !issueForm.item_key}>+ Zimmet Ver</button>
          </form>
        )}
        {issues.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {issues.map(row => (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', borderLeft: `3px solid ${row.returned_at ? 'var(--green)' : 'var(--accent)'}`, opacity: row.returned_at ? 0.7 : 1 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{row.label}{row.size ? ` · ${row.size}` : ''} · {row.quantity} adet</div>
                  <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, marginTop: 2 }}>
                    {formatDossierDate(row.issued_at)}{row.issued_by_name ? ` · ${row.issued_by_name}` : ''}{row.note ? ` · ${row.note}` : ''}
                    {row.returned_at ? ` · İADE ${formatDossierDate(row.returned_at)}` : ''}
                  </div>
                </div>
                {row.returned_at ? <span className="badge badge-green">İade</span>
                  : canManage ? <button className="btn btn-ghost btn-sm" onClick={() => returnIssue(row)}>İade Al</button>
                  : <span className="badge badge-amber">Aktif</span>}
              </div>
            ))}
          </div>
        ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Kıyafet/ekipman zimmeti yok.</div>}
      </DossierSection>

      {isManager && <UniformCatalog staffId={staffId} />}
    </div>
  )
}
