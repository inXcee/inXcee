import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import EmptyState from '../../shared/components/EmptyState.jsx'

const TRIGGERS = [
  { value: 'occupancy_high', label: 'Doluluk yüksek', unit: '%', hint: 'Toplam yatak doluluk yüzdesi eşiği geçerse' },
  { value: 'contract_expiring', label: 'Sözleşme yaklaşıyor', unit: 'gün', hint: 'N gün içinde biten aktif firma sözleşmesi varsa' },
  { value: 'maintenance_backlog', label: 'Bakım birikimi', unit: 'adet', hint: 'Açık arıza sayısı eşiği geçerse' },
  { value: 'drill_overdue', label: 'Tatbikat gecikti', unit: 'gün', hint: 'Son tatbikattan N günden fazla geçtiyse' },
]

const ACTIONS = [
  { value: 'log', label: 'Log kaydı' },
  { value: 'notify_group', label: 'Bildirim grubuna gönder' },
]

export default function AutomationPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [editing, setEditing] = useState(null)

  const { data: rows = [] } = useQuery({
    queryKey: ['automation'],
    queryFn: () => api.get('/automation').then(r => r.data),
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['notif-groups'],
    queryFn: () => api.get('/notification-groups').then(r => r.data),
  })

  const saveMut = useMutation({
    mutationFn: (form) => form.id
      ? api.put(`/automation/${form.id}`, form)
      : api.post('/automation', form),
    onSuccess: () => {
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['automation'] })
      toast({ kind: 'success', text: 'Kural kaydedildi' })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/automation/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automation'] }); toast({ kind: 'success', text: 'Silindi' }) },
  })

  const testMut = useMutation({
    mutationFn: (id) => api.post(`/automation/${id}/test`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['automation'] })
      toast({
        kind: data.firing ? 'warning' : 'success',
        text: `${data.firing ? 'Tetiklendi' : 'Tetiklenmiyor'}: ${data.value}${data.unit || ''}` +
              (data.executed ? ` · ${data.status}` : data.skipped ? ` · ${data.skipped}` : '')
      })
    },
  })

  const evalAllMut = useMutation({
    mutationFn: () => api.post('/automation/evaluate-all').then(r => r.data),
    onSuccess: (data) => {
      const fired = data.filter(d => d.firing).length
      qc.invalidateQueries({ queryKey: ['automation'] })
      toast({ kind: fired > 0 ? 'warning' : 'success', text: `${data.length} kural değerlendirildi · ${fired} tetiklendi` })
    },
  })

  async function handleDelete(r) {
    const ok = await confirmDialog({ title: 'Kuralı sil', body: `"${r.name}" silinsin mi?`, danger: true })
    if (ok) delMut.mutate(r.id)
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: 4 }}>OTOMASYON KURALLARI</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
            EŞİK TETİKLİ OTOMATİK AKSIYONLAR (NO-CODE)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => evalAllMut.mutate()} disabled={evalAllMut.isPending}>
            ▶ Tümünü değerlendir
          </button>
          <button className="btn btn-primary" onClick={() => setEditing({ trigger_type: 'occupancy_high', action_type: 'log', cooldown_hours: 24, is_active: true })}>+ YENİ KURAL</button>
        </div>
      </div>

      {editing && (
        <RuleForm
          initial={editing}
          groups={groups}
          saving={saveMut.isPending}
          onSave={(form) => saveMut.mutate(form)}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">KURALLAR ({rows.length})</div></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <EmptyState
              icon="⚙"
              title="Henüz kural yok"
              hint="Örnek: 'doluluk %95 üstüne çıkarsa yöneticileri bilgilendir', 'sözleşme 30 gün içinde bitecekse log düş'"
            />
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 50, padding: 8 }}>Aktif</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Ad</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Tetikleyici</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Eşik</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Aksiyon</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Son durum</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const trig = TRIGGERS.find(t => t.value === r.trigger_type)
                    const act = ACTIONS.find(a => a.value === r.action_type)
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border)', opacity: r.is_active ? 1 : 0.5 }}>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                            background: r.is_active ? 'var(--green, #22c55e)' : '#666',
                          }} />
                        </td>
                        <td style={{ padding: 8 }}><strong>{r.name}</strong></td>
                        <td style={{ padding: 8, fontSize: 12 }}>{trig?.label || r.trigger_type}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {r.trigger_threshold}{trig?.unit ? ' ' + trig.unit : ''}
                        </td>
                        <td style={{ padding: 8, fontSize: 12 }}>
                          {act?.label || r.action_type}
                          {r.action_target_name && <div style={{ fontSize: 10, color: 'var(--text3)' }}>→ {r.action_target_name}</div>}
                        </td>
                        <td style={{ padding: 8, fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                          {r.last_triggered_at ? (
                            <>
                              <div>{new Date(r.last_triggered_at).toLocaleString('tr-TR')}</div>
                              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.last_status}</div>
                            </>
                          ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => testMut.mutate(r.id)}>▶ Test</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>Düzenle</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(r)} style={{ color: 'var(--red, #ef4444)' }}>Sil</button>
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

function RuleForm({ initial, groups, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: '', trigger_type: 'occupancy_high', trigger_threshold: 90,
    action_type: 'log', action_target: '', cooldown_hours: 24, is_active: true,
    ...initial,
  })
  const trig = TRIGGERS.find(t => t.value === form.trigger_type)
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div style={{ height: 2, background: 'var(--accent)' }} />
      <div className="panel-header"><div className="panel-title">{initial?.id ? 'KURAL DÜZENLE' : 'YENİ KURAL'}</div></div>
      <div className="panel-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="form-label">KURAL ADI *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ör. Doluluk yuksek uyarisi" />
          </div>
          <div>
            <label className="form-label">TETİKLEYİCİ</label>
            <select className="form-select" value={form.trigger_type} onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))}>
              {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{trig?.hint}</div>
          </div>
          <div>
            <label className="form-label">EŞİK ({trig?.unit})</label>
            <input className="form-input" type="number" step="0.1" value={form.trigger_threshold} onChange={e => setForm(f => ({ ...f, trigger_threshold: +e.target.value }))} />
          </div>
          <div>
            <label className="form-label">AKSIYON</label>
            <select className="form-select" value={form.action_type} onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))}>
              {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          {form.action_type === 'notify_group' && (
            <div>
              <label className="form-label">HEDEF GRUP</label>
              <select className="form-select" value={form.action_target || ''} onChange={e => setForm(f => ({ ...f, action_target: e.target.value ? +e.target.value : null }))}>
                <option value="">— grup seç —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.member_count} üye)</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">COOLDOWN (saat)</label>
            <input className="form-input" type="number" value={form.cooldown_hours} onChange={e => setForm(f => ({ ...f, cooldown_hours: +e.target.value }))} />
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Aynı kural tekrar bu kadar süre çalışmaz</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11 }}>
              <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              AKTİF
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!form.name || saving} onClick={() => onSave(form)}>{saving ? 'KAYDEDİLİYOR...' : 'KAYDET'}</button>
          <button className="btn btn-ghost" onClick={onCancel}>İPTAL</button>
        </div>
      </div>
    </div>
  )
}
