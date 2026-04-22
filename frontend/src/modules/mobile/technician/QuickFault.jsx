import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'

const PRIORITIES = [
  { value: 'high', label: 'Yüksek', color: '#ef4444' },
  { value: 'medium', label: 'Orta', color: '#f59e0b' },
  { value: 'low', label: 'Düşük', color: '#10b981' },
]

export default function QuickFault() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ location: '', description: '', priority: 'medium' })
  const [success, setSuccess] = useState(null)

  const mutation = useMutation({
    mutationFn: () => mobileApi.post('/maintenance/requests', form),
    onSuccess: res => {
      setSuccess(res.data.id)
      qc.invalidateQueries({ queryKey: ['mobile-tech-requests'] })
    },
  })

  function reset() {
    setForm({ location: '', description: '', priority: 'medium' })
    setSuccess(null)
  }

  if (success) return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
      <div style={{ fontSize: '56px', marginBottom: '16px' }}>🔧</div>
      <h2 style={{ fontWeight: 700, margin: '0 0 8px' }}>Talep Oluşturuldu</h2>
      <p style={{ color: '#6b7280', margin: '0 0 4px' }}>Talep #{success}</p>
      <p style={{ color: '#9ca3af', fontSize: '13px', margin: '0 0 32px' }}>Talep sisteme kaydedildi</p>
      <button onClick={reset} style={submitBtn('#3b82f6', true)}>Yeni Talep Oluştur</button>
    </div>
  )

  const canSubmit = form.location.trim().length >= 2 && form.description.trim().length >= 5

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Hızlı Arıza Bildirimi</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 20px' }}>Yeni teknik talep oluşturun</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Field label="KONUM">
          <input value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            placeholder="ör: M2 Blok, Kat 2 — Tesisat"
            style={inputStyle} />
        </Field>

        <Field label="AÇIKLAMA">
          <textarea value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={4} placeholder="Arızayı detaylı açıklayın..."
            style={{ ...inputStyle, resize: 'none' }} />
        </Field>

        <Field label="ÖNCELİK">
          <div style={{ display: 'flex', gap: '8px' }}>
            {PRIORITIES.map(p => (
              <button key={p.value} onClick={() => setForm(f => ({ ...f, priority: p.value }))}
                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: `2px solid ${form.priority === p.value ? p.color : '#e5e7eb'}`, background: form.priority === p.value ? p.color + '18' : '#fff', color: form.priority === p.value ? p.color : '#9ca3af', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        {mutation.error && (
          <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>
            {mutation.error.response?.data?.error || 'Bir hata oluştu'}
          </p>
        )}

        <button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
          style={submitBtn('#3b82f6', canSubmit && !mutation.isPending)}>
          {mutation.isPending ? 'Kaydediliyor...' : '+ Talep Oluştur'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e5e7eb',
  fontSize: '14px', background: '#fff', boxSizing: 'border-box',
}

function submitBtn(bg, enabled) {
  return {
    width: '100%', padding: '14px', borderRadius: '12px', background: bg, color: '#fff',
    border: 'none', fontSize: '15px', fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  }
}
