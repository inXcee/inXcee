import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

function daysLeft(dateStr) {
  if (!dateStr) return null
  const ms = new Date(dateStr).getTime() - Date.now()
  return Math.floor(ms / 86400000)
}

function ContractBadge({ end }) {
  const d = daysLeft(end)
  if (d == null) return <span style={{ color: 'var(--text3)' }}>—</span>
  if (d < 0) return <span style={{ color: 'var(--red, #ef4444)', fontWeight: 600 }}>SÜRESİ DOLDU ({Math.abs(d)} gün)</span>
  if (d <= 7) return <span style={{ color: 'var(--red, #ef4444)' }}>{d} gün kaldı</span>
  if (d <= 30) return <span style={{ color: 'var(--orange, #f97316)' }}>{d} gün kaldı</span>
  return <span style={{ color: 'var(--green, #22c55e)' }}>{d} gün</span>
}

function CompanyForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: '', contact_name: '', contact_phone: '', contact_email: '',
    tax_no: '', contract_start: '', contract_end: '',
    bed_quota: '', price_per_bed: '', notes: '', is_active: true,
    ...initial,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div style={{ height: 2, background: 'var(--accent)' }} />
      <div className="panel-header">
        <div className="panel-title">{initial?.id ? 'FİRMA DÜZENLE' : 'YENİ FİRMA'}</div>
      </div>
      <div className="panel-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label className="form-label">FİRMA ADI *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="form-label">VERGİ NO</label>
            <input className="form-input" value={form.tax_no} onChange={e => set('tax_no', e.target.value)} />
          </div>
          <div>
            <label className="form-label">YETKİLİ KİŞİ</label>
            <input className="form-input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          </div>
          <div>
            <label className="form-label">TELEFON</label>
            <input className="form-input" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
          </div>
          <div>
            <label className="form-label">E-POSTA</label>
            <input className="form-input" type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
          </div>
          <div>
            <label className="form-label">YATAK KOTASI</label>
            <input className="form-input" type="number" value={form.bed_quota ?? ''} onChange={e => set('bed_quota', e.target.value ? +e.target.value : null)} />
          </div>
          <div>
            <label className="form-label">FİYAT / YATAK (₺/ay)</label>
            <input className="form-input" type="number" step="0.01" value={form.price_per_bed ?? ''} onChange={e => set('price_per_bed', e.target.value ? +e.target.value : null)} />
          </div>
          <div>
            <label className="form-label">SÖZLEŞME BAŞLANGIÇ</label>
            <input className="form-input" type="date" value={form.contract_start || ''} onChange={e => set('contract_start', e.target.value)} />
          </div>
          <div>
            <label className="form-label">SÖZLEŞME BİTİŞ</label>
            <input className="form-input" type="date" value={form.contract_end || ''} onChange={e => set('contract_end', e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'end', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11 }}>
              <input type="checkbox" checked={form.is_active !== false} onChange={e => set('is_active', e.target.checked)} />
              AKTİF
            </label>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="form-label">NOTLAR</label>
          <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>{saving ? 'KAYDEDİLİYOR...' : 'KAYDET'}</button>
          <button className="btn btn-ghost" onClick={onCancel}>İPTAL</button>
        </div>
      </div>
    </div>
  )
}

export default function CompaniesPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [editing, setEditing] = useState(null) // null=none, {}=new, {id...}=edit
  const [search, setSearch] = useState('')

  const { data: rows = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(r => r.data),
  })
  const { data: expiring = [] } = useQuery({
    queryKey: ['companies-expiring'],
    queryFn: () => api.get('/companies/expiring?days=30').then(r => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['companies-stats'],
    queryFn: () => api.get('/companies/stats').then(r => r.data),
  })

  const filtered = rows.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.contact_name?.toLowerCase().includes(search.toLowerCase())
  )

  const saveMut = useMutation({
    mutationFn: (form) => form.id
      ? api.put(`/companies/${form.id}`, form)
      : api.post('/companies', form),
    onSuccess: () => {
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['companies'] })
      qc.invalidateQueries({ queryKey: ['companies-expiring'] })
      qc.invalidateQueries({ queryKey: ['companies-stats'] })
      toast({ kind: 'success', text: 'Firma kaydedildi' })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/companies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      toast({ kind: 'success', text: 'Firma silindi' })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Silinemedi' }),
  })

  async function handleDelete(c) {
    const ok = await confirmDialog({
      title: 'Firma Sil',
      body: `"${c.name}" silinsin mi? Bu işlem geri alınamaz.`,
      danger: true,
      confirmLabel: 'Sil',
    })
    if (ok) delMut.mutate(c.id)
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: 4 }}>FİRMALAR / SÖZLEŞMELER</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
            FIRMA YONETIMI VE SOZLESME TAKIBI
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>+ YENİ FİRMA</button>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label="Toplam" value={stats.total || 0} />
          <Stat label="Aktif" value={stats.active || 0} color="green" />
          <Stat label="Süresi Dolmuş" value={stats.expired || 0} color="red" />
          <Stat label="Toplam Yatak Kotası" value={stats.total_quota || 0} />
        </div>
      )}

      {expiring.length > 0 && (
        <div style={{ padding: 12, marginBottom: 16, border: '1px solid var(--orange, #f97316)', borderRadius: 6, background: 'rgba(249,115,22,.08)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--orange, #f97316)', marginBottom: 6, letterSpacing: 2 }}>
            ⚠ SÖZLEŞMESİ YAKLAŞAN FİRMALAR (30 gün)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {expiring.map(e => (
              <span key={e.id} style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11,
                background: e.days_left < 7 ? 'rgba(239,68,68,.15)' : 'rgba(249,115,22,.15)',
                color: e.days_left < 7 ? 'var(--red, #ef4444)' : 'var(--orange, #f97316)',
              }}>
                {e.name} — {e.days_left < 0 ? `${Math.abs(e.days_left)} gün geçti` : `${e.days_left} gün`}
              </span>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <CompanyForm
          initial={editing}
          saving={saveMut.isPending}
          onSave={(form) => saveMut.mutate(form)}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="panel-title">FİRMALAR ({filtered.length})</div>
          <div style={{ flex: 1 }} />
          <input
            className="form-input"
            style={{ width: 220 }}
            placeholder="Ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div style={{ overflow: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Ad</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Yetkili</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Telefon</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Kota</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Aktif Pers.</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Sözleşme</th>
                  <th style={{ width: 130, padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Henüz firma eklenmemiş</td></tr>
                )}
                {filtered.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)', opacity: c.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: 8 }}>
                      <strong>{c.name}</strong>
                      {!c.is_active && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text3)' }}>(pasif)</span>}
                    </td>
                    <td style={{ padding: 8, fontSize: 12 }}>{c.contact_name || '-'}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{c.contact_phone || '-'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{c.bed_quota ?? '-'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{c.active_personnel}</td>
                    <td style={{ padding: 8, fontSize: 11 }}>
                      <ContractBadge end={c.contract_end} />
                      {c.contract_end && (
                        <div style={{ color: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)' }}>{c.contract_end}</div>
                      )}
                    </td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Düzenle</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c)} style={{ color: 'var(--red, #ef4444)' }}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  const c = color === 'green' ? 'var(--green, #22c55e)' : color === 'red' ? 'var(--red, #ef4444)' : 'var(--text)'
  return (
    <div className="panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: c }}>{value}</div>
    </div>
  )
}
