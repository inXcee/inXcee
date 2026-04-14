import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../api/client.js'

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [error, setError] = useState(null)

  const mut = useMutation({
    mutationFn: () => api.patch('/auth/password', {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    }),
    onSuccess: () => onClose('success'),
    onError: e => setError(e.response?.data?.error ?? 'Hata oluştu'),
  })

  function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (form.newPassword !== form.confirm) {
      return setError('Yeni şifreler eşleşmiyor')
    }
    if (form.newPassword.length < 8) {
      return setError('Yeni şifre en az 8 karakter olmalı')
    }
    mut.mutate()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={() => onClose(null)}
    >
      <div className="panel" style={{ width: '360px', margin: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header">
          <div className="panel-title">SIFRE DEGISTIR</div>
        </div>
        <div className="panel-body">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-danger" style={{ marginBottom: '12px' }}>{error}</div>
            )}
            <div style={{ marginBottom: '12px' }}>
              <label className="form-label">MEVCUT SIFRE</label>
              <input type="password" className="form-input" value={form.currentPassword}
                onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label className="form-label">YENI SIFRE (min 8 karakter)</label>
              <input type="password" className="form-input" value={form.newPassword}
                onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label className="form-label">YENI SIFRE (tekrar)</label>
              <input type="password" className="form-input" value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={mut.isPending}>
                {mut.isPending ? 'KAYDEDILIYOR...' : 'DEGISTIR'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onClose(null)}>
                IPTAL
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
