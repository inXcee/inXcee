import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const MINUTES = [0, 15, 30, 45]

export default function SettingsPage() {
  const qc = useQueryClient()
  const [toast, setToast] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['email-settings'],
    queryFn: () => api.get('/settings/email').then(r => r.data),
  })

  const [form, setForm] = useState(null)
  const current = form ?? data

  const save = useMutation({
    mutationFn: body => api.put('/settings/email', body),
    onSuccess: () => {
      qc.invalidateQueries(['email-settings'])
      setForm(null)
      showToast('Ayarlar kaydedildi', 'success')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const testSend = useMutation({
    mutationFn: () => api.post('/settings/email/test'),
    onSuccess: () => showToast('Test e-postası gönderildi', 'success'),
    onError: e => showToast(e.response?.data?.error ?? 'Gönderim hatası', 'error'),
  })

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function handleSave(e) {
    e.preventDefault()
    save.mutate({
      enabled: current.enabled,
      hour:    parseInt(current.hour, 10),
      minute:  parseInt(current.minute, 10),
      cc:      current.cc ?? '',
    })
  }

  if (isLoading) return <div style={{ padding: '32px' }}>Yükleniyor...</div>

  return (
    <div style={{ padding: '24px', maxWidth: '560px' }}>
      {toast && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', borderRadius: '6px',
          background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: toast.type === 'success' ? '#166534' : '#991b1b',
          border: `1px solid ${toast.type === 'success' ? '#86efac' : '#fca5a5'}`,
        }}>
          {toast.msg}
        </div>
      )}

      <div className="panel">
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header">
          <div className="panel-title">E-POSTA RAPORU AYARLARI</div>
        </div>
        <div className="panel-body">
          <form onSubmit={handleSave}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>E-posta Raporu</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...(f ?? data), enabled: !current.enabled }))}
                style={{
                  width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                  background: current.enabled ? 'var(--accent)' : '#cbd5e1',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: '3px',
                  left: current.enabled ? '22px' : '3px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s', display: 'block',
                }} />
              </button>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {current.enabled ? 'Aktif' : 'Kapalı'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="form-label">GÖNDERİM SAATİ (0-23)</label>
                <input
                  type="number" min="0" max="23" className="form-input"
                  value={current.hour}
                  onChange={e => setForm(f => ({ ...(f ?? data), hour: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">DAKİKA</label>
                <select
                  className="form-select"
                  value={current.minute}
                  onChange={e => setForm(f => ({ ...(f ?? data), minute: parseInt(e.target.value, 10) }))}
                >
                  {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="form-label">CC ADRESİ (OPSİYONEL)</label>
              <input
                type="email" className="form-input"
                placeholder="cc@ornek.com"
                value={current.cc ?? ''}
                onChange={e => setForm(f => ({ ...(f ?? data), cc: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button
                type="button" className="btn btn-secondary"
                disabled={testSend.isPending}
                onClick={() => testSend.mutate()}
              >
                {testSend.isPending ? 'Gönderiliyor...' : 'Test Gönder'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
