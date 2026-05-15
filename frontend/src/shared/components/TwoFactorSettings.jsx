import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client.js'
import { useToastStore } from '../store/toastStore.js'

export default function TwoFactorSettings() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [setupData, setSetupData] = useState(null)
  const [code, setCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [showDisable, setShowDisable] = useState(false)

  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => api.get('/auth/2fa/status').then(r => r.data),
  })

  const startMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/setup').then(r => r.data),
    onSuccess: (d) => setSetupData(d),
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  const enableMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/enable', { code }).then(r => r.data),
    onSuccess: () => {
      toast({ kind: 'success', text: '2FA aktif edildi' })
      setSetupData(null); setCode('')
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Kod hatalı' }),
  })

  const disableMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { code: disableCode }).then(r => r.data),
    onSuccess: () => {
      toast({ kind: 'success', text: '2FA kapatıldı' })
      setShowDisable(false); setDisableCode('')
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  if (isLoading) return null

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div style={{ height: 2, background: 'var(--accent)' }} />
      <div className="panel-header">
        <div className="panel-title">İKİ FAKTÖRLÜ DOĞRULAMA (2FA)</div>
      </div>
      <div className="panel-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 11,
            background: status?.enabled ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.1)',
            color: status?.enabled ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)',
            fontFamily: 'var(--mono)', letterSpacing: 1,
          }}>{status?.enabled ? '✓ AKTİF' : '✗ KAPALI'}</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            Google Authenticator, Authy, 1Password gibi TOTP uygulamaları ile.
          </span>
        </div>

        {!status?.enabled && !setupData && (
          <button className="btn btn-primary" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
            {startMut.isPending ? 'HAZIRLANIYOR...' : '2FA KURULUMUNU BAŞLAT'}
          </button>
        )}

        {setupData && (
          <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)' }}>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
              <strong>1.</strong> Authenticator uygulamanızda QR kodu tarayın.
            </p>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <img src={setupData.qr} alt="2FA QR" style={{ width: 200, height: 200, background: '#fff', padding: 8, borderRadius: 6 }} />
            </div>
            <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 8 }}>
              Manuel kod: <span style={{ color: 'var(--accent)', userSelect: 'all' }}>{setupData.secret}</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
              <strong>2.</strong> Uygulamadaki 6 haneli kodu girip onaylayın:
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="form-input"
              placeholder="123456"
              style={{ textAlign: 'center', fontSize: 18, letterSpacing: 6, fontFamily: 'var(--mono)' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" disabled={code.length !== 6 || enableMut.isPending} onClick={() => enableMut.mutate()}>
                {enableMut.isPending ? 'AKTİFLEŞTİRİLİYOR...' : 'ONAYLA VE AKTİF ET'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setSetupData(null); setCode('') }}>İPTAL</button>
            </div>
          </div>
        )}

        {status?.enabled && (
          <>
            {!showDisable ? (
              <button className="btn btn-ghost" onClick={() => setShowDisable(true)}>2FA'YI KAPAT</button>
            ) : (
              <div style={{ padding: 12, border: '1px solid var(--red, #ef4444)', borderRadius: 6, background: 'rgba(239,68,68,.05)' }}>
                <p style={{ fontSize: 12, marginBottom: 8 }}>Kapatmak için mevcut 6 haneli kodu girin:</p>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={disableCode}
                  onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="form-input"
                  placeholder="123456"
                  style={{ textAlign: 'center', fontSize: 18, letterSpacing: 6, fontFamily: 'var(--mono)' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-danger" disabled={disableCode.length !== 6 || disableMut.isPending} onClick={() => disableMut.mutate()}>
                    {disableMut.isPending ? 'KAPATILIYOR...' : 'KAPATMAYI ONAYLA'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setShowDisable(false); setDisableCode('') }}>İPTAL</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
