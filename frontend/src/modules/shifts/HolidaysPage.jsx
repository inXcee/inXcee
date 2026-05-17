import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

export default function HolidaysPage() {
  const qc = useQueryClient()
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ date: '', name: '', multiplier: 2.0, is_half_day: false })

  const { data = [], isLoading } = useQuery({
    queryKey: ['holidays', year],
    queryFn: () => api.get(`/shifts/holidays?year=${year}`).then(r => r.data),
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['holidays'] })

  const saveMut = useMutation({
    mutationFn: () => editing?.id
      ? api.put(`/shifts/holidays/${editing.id}`, form)
      : api.post('/shifts/holidays', form),
    onSuccess: () => { toast('Kaydedildi'); inv(); setEditing(null); setForm({ date: '', name: '', multiplier: 2.0, is_half_day: false }) },
    onError: toastErr,
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/shifts/holidays/${id}`),
    onSuccess: () => { toast('Silindi'); inv() }, onError: toastErr,
  })

  function startEdit(h) {
    setEditing(h)
    setForm({ date: h.date, name: h.name, multiplier: h.multiplier, is_half_day: !!h.is_half_day })
  }

  return (
    <div style={{ maxWidth: 900 }} className="fade-up">
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>RESMİ TATİLLER</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
            TATİLDE ÇALIŞMA OTOMATİK MESAİ × ÇARPAN İLE HESAPLANIR
          </p>
        </div>
        <input type="number" min="2024" max="2030" value={year} onChange={e => setYear(e.target.value)}
          className="form-input" style={{ width: 100, fontSize: 12, borderRadius: 10 }} />
      </div>

      {/* Form */}
      <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 10 }}>
          {editing?.id ? '✎ DÜZENLE' : '+ YENİ TATİL'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
            style={{ fontSize: 12, width: 150 }} />
          <input className="form-input" placeholder="Tatil adı (ör: Cumhuriyet Bayramı)" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} style={{ fontSize: 12 }} />
          <input type="number" step="0.1" min="1" max="3" value={form.multiplier}
            onChange={e => setForm({ ...form, multiplier: parseFloat(e.target.value) || 2 })}
            className="form-input" style={{ width: 80, fontSize: 12 }} title="Maaş çarpanı (1.5x, 2x)" />
          <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={form.is_half_day} onChange={e => setForm({ ...form, is_half_day: e.target.checked })} />
            YARIM
          </label>
          <button onClick={() => saveMut.mutate()} disabled={!form.date || !form.name || saveMut.isPending}
            className="btn btn-primary btn-sm" style={{ borderRadius: 8 }}>
            {editing?.id ? 'GÜNCELLE' : '+ EKLE'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ date: '', name: '', multiplier: 2.0, is_half_day: false }) }}
              className="btn btn-ghost btn-sm" style={{ gridColumn: '1 / -1' }}>İPTAL</button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 30, color: 'var(--text3)' }}>Yükleniyor…</div>
      ) : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>🎉</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>{year} İÇİN TATİL YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TARİH</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>AD</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ÇARPAN</th>
                <th style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>YARIM</th>
                <th style={{ padding: 10 }} />
              </tr>
            </thead>
            <tbody>
              {data.map(h => (
                <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{h.date}</td>
                  <td style={{ padding: 10, fontWeight: 600 }}>{h.name}</td>
                  <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--purple)' }}>{h.multiplier}x</td>
                  <td style={{ padding: 10, textAlign: 'center' }}>{h.is_half_day ? '½' : ''}</td>
                  <td style={{ padding: 10, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => startEdit(h)} className="btn btn-ghost btn-xs">✎</button>
                    <button onClick={async () => { if (await confirmDialog({ title: 'Sil', body: `${h.name} silinecek`, confirmLabel: 'Sil' })) delMut.mutate(h.id) }}
                      className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
