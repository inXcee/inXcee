import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

// İSG olay/kaza takibi — SafetyPage "OLAYLAR" sekmesi.
// Kayıt: tip + şiddet + zaman/konum/açıklama; akış: open → investigating → closed.
// major/critical kayıtta backend campus_manager'a bildirim üretir.

const toast = (msg, type = 'success') => useToastStore.getState().addToast(msg, type)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

export const INCIDENT_TYPES = {
  injury: '🩹 Yaralanma',
  near_miss: '⚠️ Ramak kala',
  property_damage: '🔨 Maddi hasar',
  environmental: '🌍 Çevresel',
  other: '📋 Diğer',
}
const SEVERITIES = { minor: 'Hafif', moderate: 'Orta', major: 'Ciddi', critical: 'Kritik' }
const SEV_COLOR = { minor: 'var(--text3)', moderate: 'var(--amber)', major: '#f97316', critical: 'var(--red)' }
const STATUS_TR = { open: 'AÇIK', investigating: 'İNCELEMEDE', closed: 'KAPALI' }

const EMPTY_FORM = { occurred_at: '', location: '', incident_type: 'near_miss', severity: 'minor', description: '', actions_taken: '' }

export default function IncidentsTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data = [], isLoading } = useQuery({
    queryKey: ['safety-incidents', statusFilter],
    queryFn: () => api.get(`/safety/incidents${statusFilter ? `?status=${statusFilter}` : ''}`).then(r => r.data),
  })
  const inv = () => qc.invalidateQueries({ queryKey: ['safety-incidents'] })

  const createMut = useMutation({
    mutationFn: () => api.post('/safety/incidents', {
      ...form,
      occurred_at: form.occurred_at.replace('T', ' '),
      location: form.location || null,
      actions_taken: form.actions_taken || null,
    }),
    onSuccess: () => { toast('Olay kaydedildi'); setCreating(false); setForm(EMPTY_FORM); inv() },
    onError: toastErr,
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/safety/incidents/${id}`, body),
    onSuccess: () => { toast('Güncellendi'); inv() },
    onError: toastErr,
  })

  return (
    <div>
      {/* Filtre + yeni kayıt */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['', 'TÜMÜ'], ['open', 'AÇIK'], ['investigating', 'İNCELEMEDE'], ['closed', 'KAPALI']].map(([s, l]) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="btn btn-ghost btn-sm"
            style={{ borderRadius: 8, ...(statusFilter === s ? { background: 'var(--accent)', color: '#000' } : {}) }}>{l}</button>
        ))}
        <button onClick={() => setCreating(c => !c)} className="btn btn-primary btn-sm" style={{ marginLeft: 'auto', borderRadius: 8 }}>
          {creating ? 'VAZGEÇ' : '+ OLAY BİLDİR'}
        </button>
      </div>

      {/* Yeni olay formu */}
      {creating && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="form-label">Olay zamanı *</label>
              <input type="datetime-local" className="form-input" value={form.occurred_at}
                onChange={e => setForm({ ...form, occurred_at: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Tip *</label>
              <select className="form-select" value={form.incident_type} onChange={e => setForm({ ...form, incident_type: e.target.value })}>
                {Object.entries(INCIDENT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Şiddet *</label>
              <select className="form-select" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                {Object.entries(SEVERITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Konum</label>
              <input className="form-input" value={form.location} placeholder="örn. M1 blok merdiven"
                onChange={e => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>
          <label className="form-label">Açıklama *</label>
          <textarea className="form-input" rows={3} value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Ne oldu, kim etkilendi, tanıklar..." style={{ marginBottom: 10 }} />
          <label className="form-label">Alınan ilk aksiyonlar</label>
          <textarea className="form-input" rows={2} value={form.actions_taken}
            onChange={e => setForm({ ...form, actions_taken: e.target.value })} style={{ marginBottom: 12 }} />
          <button className="btn btn-primary" disabled={createMut.isPending || !form.occurred_at || !form.description.trim()}
            onClick={() => createMut.mutate()}>
            {createMut.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
          </button>
          {(form.severity === 'major' || form.severity === 'critical') && (
            <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--red)' }}>Bu şiddette yönetime anında bildirim gider.</span>
          )}
        </div>
      )}

      {/* Liste */}
      {isLoading ? <SkeletonTable rows={4} cols={4} /> : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, opacity: 0.3 }}>🦺</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, marginTop: 8 }}>OLAY KAYDI YOK</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map(i => (
            <div key={i.id} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              borderLeft: `4px solid ${SEV_COLOR[i.severity] || 'var(--border)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {INCIDENT_TYPES[i.incident_type] || i.incident_type}
                    <span style={{ marginLeft: 8, fontSize: 11, color: SEV_COLOR[i.severity] }}>{SEVERITIES[i.severity]}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {String(i.occurred_at).slice(0, 16)} {i.location && `· ${i.location}`} {i.staff_name && `· ${i.staff_name}`}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>{i.description}</div>
                  {i.actions_taken && (
                    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text3)' }}>Aksiyon: {i.actions_taken}</div>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 8px', borderRadius: 4,
                  background: i.status === 'closed' ? 'rgba(34,197,94,.12)' : i.status === 'investigating' ? 'rgba(245,158,11,.12)' : 'var(--surface2)',
                  color: i.status === 'closed' ? 'var(--green)' : i.status === 'investigating' ? 'var(--amber)' : 'var(--text2)' }}>
                  {STATUS_TR[i.status] || i.status}
                </span>
              </div>
              {i.status !== 'closed' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {i.status === 'open' && (
                    <button className="btn btn-ghost btn-sm" disabled={updateMut.isPending}
                      onClick={() => updateMut.mutate({ id: i.id, status: 'investigating' })}>🔍 İNCELEMEYE AL</button>
                  )}
                  <button className="btn btn-primary btn-sm" disabled={updateMut.isPending}
                    onClick={() => {
                      const note = window.prompt('Kapanış aksiyonu / sonuç (opsiyonel):', i.actions_taken || '')
                      if (note === null) return
                      updateMut.mutate({ id: i.id, status: 'closed', ...(note.trim() ? { actions_taken: note.trim() } : {}) })
                    }}>✓ KAPAT</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
