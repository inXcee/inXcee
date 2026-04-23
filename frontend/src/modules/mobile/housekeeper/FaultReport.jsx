import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { compressImage } from '../../../shared/utils/compressImage.js'

const PRIORITIES = [
  { value: 'high', label: 'Yüksek', color: '#ef4444' },
  { value: 'medium', label: 'Orta', color: '#f59e0b' },
  { value: 'low', label: 'Düşük', color: '#10b981' },
]

export default function FaultReport() {
  const [form, setForm] = useState({ location: '', description: '', priority: 'medium' })
  const [photo, setPhoto] = useState(null)
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('location', form.location)
      fd.append('description', form.description)
      fd.append('priority', form.priority)
      if (photo) fd.append('photo', await compressImage(photo))
      return mobileApi.post('/housekeeping/fault-report', fd)
    },
    onSuccess: () => { navigator.vibrate?.([20, 60, 20]); setSuccess(true) },
  })

  function reset() {
    setForm({ location: '', description: '', priority: 'medium' })
    setPhoto(null)
    setSuccess(false)
  }

  if (success) return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
      <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
      <h2 style={{ fontWeight: 700, margin: '0 0 8px' }}>Arıza Bildirildi</h2>
      <p style={{ color: '#6b7280', margin: '0 0 32px' }}>Teknik ekip bilgilendirildi</p>
      <button onClick={reset} style={submitBtn('#3b82f6', true)}>Yeni Bildirim Yap</button>
    </div>
  )

  const canSubmit = form.location.length >= 2 && form.description.length >= 5

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Arıza Bildir</h1>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 20px' }}>Tespit ettiğiniz arızayı bildirin</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Field label="KONUM">
          <input value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            placeholder="ör: M1 Blok, 3. Kat Banyo"
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

        <Field label="FOTOĞRAF (opsiyonel)">
          <input type="file" accept="image/*" capture="environment"
            onChange={e => setPhoto(e.target.files[0] || null)}
            style={{ ...inputStyle, padding: '10px', cursor: 'pointer' }} />
          {photo && (
            <p style={{ fontSize: '12px', color: '#10b981', margin: '4px 0 0' }}>✓ {photo.name}</p>
          )}
        </Field>

        {mutation.error && (
          <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>
            {mutation.error.response?.data?.error || 'Bir hata oluştu'}
          </p>
        )}

        <button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
          style={submitBtn('#ef4444', canSubmit && !mutation.isPending)}>
          {mutation.isPending ? 'Gönderiliyor...' : '⚠️ Arıza Bildir'}
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
