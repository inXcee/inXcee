import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import EmptyState from '../../shared/components/EmptyState.jsx'

const TYPES = [
  { value: 'fire', label: '🔥 Yangın' },
  { value: 'earthquake', label: '🌐 Deprem' },
  { value: 'security', label: '🛡 Güvenlik' },
  { value: 'evacuation', label: '🚪 Tahliye' },
  { value: 'other', label: 'Diğer' },
]

export default function DrillsPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    drill_type: 'fire', drill_date: new Date().toISOString().slice(0, 10),
    expected_count: '', actual_count: '', duration_minutes: '',
    missing_names: '', findings: '', next_action: '', next_drill_date: '',
  })

  const { data: rows = [] } = useQuery({
    queryKey: ['drills'],
    queryFn: () => api.get('/drills').then(r => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['drills-stats'],
    queryFn: () => api.get('/drills/stats').then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/drills', {
      ...form,
      expected_count: form.expected_count ? +form.expected_count : null,
      actual_count: form.actual_count ? +form.actual_count : null,
      duration_minutes: form.duration_minutes ? +form.duration_minutes : null,
    }),
    onSuccess: () => {
      setShowForm(false)
      qc.invalidateQueries({ queryKey: ['drills'] })
      qc.invalidateQueries({ queryKey: ['drills-stats'] })
      toast({ kind: 'success', text: 'Tatbikat kaydedildi' })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/drills/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drills'] }); toast({ kind: 'success', text: 'Silindi' }) },
  })

  async function handleDelete(d) {
    const ok = await confirmDialog({ title: 'Tatbikat sil', body: `${d.drill_date} ${d.drill_type} kaydı silinsin mi?`, danger: true })
    if (ok) delMut.mutate(d.id)
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: 4 }}>TATBİKATLAR</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
            YANGIN · DEPREM · GUVENLIK · TAHLIYE
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ YENİ TATBİKAT</button>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label="Toplam" value={stats.total || 0} />
          <Stat label="Son 365 gün" value={stats.last_year || 0} />
          <Stat label="Son tatbikat" value={stats.last_drill || '—'} small />
          <Stat label="Sıradaki" value={stats.upcoming || '—'} small color="orange" />
        </div>
      )}

      {showForm && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ height: 2, background: 'var(--accent)' }} />
          <div className="panel-header"><div className="panel-title">YENİ TATBİKAT</div></div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label className="form-label">TİP *</label>
                <select className="form-select" value={form.drill_type} onChange={e => setForm(f => ({ ...f, drill_type: e.target.value }))}>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">TARİH *</label>
                <input className="form-input" type="date" value={form.drill_date} onChange={e => setForm(f => ({ ...f, drill_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">BEKLENEN KATILIM</label>
                <input className="form-input" type="number" value={form.expected_count} onChange={e => setForm(f => ({ ...f, expected_count: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">FİİLİ KATILIM</label>
                <input className="form-input" type="number" value={form.actual_count} onChange={e => setForm(f => ({ ...f, actual_count: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">SÜRE (dk)</label>
                <input className="form-input" type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">SIRADAKİ TARİH</label>
                <input className="form-input" type="date" value={form.next_drill_date} onChange={e => setForm(f => ({ ...f, next_drill_date: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">KATILMAYANLAR</label>
                <textarea className="form-input" rows={2} value={form.missing_names} onChange={e => setForm(f => ({ ...f, missing_names: e.target.value }))} placeholder="Ali Veli, Mehmet Demir..." />
              </div>
              <div>
                <label className="form-label">BULGULAR / NOTLAR</label>
                <textarea className="form-input" rows={2} value={form.findings} onChange={e => setForm(f => ({ ...f, findings: e.target.value }))} placeholder="Sıkışma, kapı açılmadı, ekipman vb." />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">DÜZELTİCİ AKSIYON</label>
              <textarea className="form-input" rows={2} value={form.next_action} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>İPTAL</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">GEÇMİŞ ({rows.length})</div></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <EmptyState icon="🔥" title="Henüz tatbikat kaydı yok" hint="İlk tatbikatınızı kaydetmek için 'Yeni Tatbikat' butonunu kullanın" />
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 8 }}>Tarih</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Tip</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Beklenen</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Fiili</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Süre</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Bulgular</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Sıradaki</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(d => {
                    const type = TYPES.find(t => t.value === d.drill_type)
                    const attendance = d.expected_count && d.actual_count
                      ? Math.round((d.actual_count / d.expected_count) * 100) : null
                    return (
                      <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{d.drill_date}</td>
                        <td style={{ padding: 8 }}>{type?.label || d.drill_type}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{d.expected_count ?? '-'}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {d.actual_count ?? '-'}
                          {attendance != null && (
                            <span style={{ marginLeft: 4, fontSize: 10, color: attendance >= 90 ? 'var(--green, #22c55e)' : 'var(--orange, #f97316)' }}>
                              ({attendance}%)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{d.duration_minutes ?? '-'}dk</td>
                        <td style={{ padding: 8, fontSize: 11, maxWidth: 300, color: 'var(--text2)' }}>{d.findings || ''}</td>
                        <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{d.next_drill_date || '-'}</td>
                        <td style={{ padding: 8 }}>
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

function Stat({ label, value, small, color }) {
  const c = color === 'orange' ? 'var(--orange, #f97316)' : 'var(--text)'
  return (
    <div className="panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: small ? 14 : 24, fontWeight: 600, color: c, fontFamily: small ? 'var(--mono)' : 'inherit' }}>{value}</div>
    </div>
  )
}
