import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'

export default function NotificationPrefsPage() {
  const qc = useQueryClient()
  const [local, setLocal] = useState(null)
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => api.get('/notification-prefs').then(r => r.data),
  })

  useEffect(() => {
    if (data && !local) setLocal(data)
  }, [data, local])

  const save = useMutation({
    mutationFn: (prefs) => api.put('/notification-prefs', { preferences: prefs }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-prefs'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const toggle = (key) => {
    setLocal(prev => prev.map(p => p.module === key ? { ...p, enabled: !p.enabled } : p))
  }

  const allOn = () => setLocal(prev => prev.map(p => ({ ...p, enabled: true })))
  const allOff = () => setLocal(prev => prev.map(p => ({ ...p, enabled: false })))

  if (isLoading || !local) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>Yükleniyor...</div>
  }

  const enabledCount = local.filter(p => p.enabled).length

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, letterSpacing: 4 }}>
          BİLDİRİM TERCİHLERİ
          <HelpHint title="BİLDİRİM TERCİHLERİ">
            Hangi modüllerden bildirim almak istediğinizi seçin. Kapatılan modülün yeni bildirimleri size gönderilmez (canlı SSE + bildirim listesi). Diğer kullanıcıların tercihlerini etkilemez.
          </HelpHint>
        </h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
          KİŞİYE ÖZEL · {enabledCount}/{local.length} MODÜL AÇIK
        </p>
      </div>

      <div className="panel fade-up-1">
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="panel-title">MODÜLLER</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={allOn}
              style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                cursor: 'pointer', letterSpacing: 1 }}>TÜMÜ AÇIK</button>
            <button type="button" onClick={allOff}
              style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                cursor: 'pointer', letterSpacing: 1 }}>TÜMÜ KAPALI</button>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {local.map(p => (
              <label key={p.module} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: 8,
                cursor: 'pointer',
              }}>
                <Switch checked={p.enabled} onChange={() => toggle(p.module)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                    {p.label}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2, letterSpacing: 1 }}>
                    {p.module}
                  </div>
                </div>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
                  color: p.enabled ? 'var(--green, #10b981)' : 'var(--text3)',
                }}>{p.enabled ? '● AÇIK' : '○ KAPALI'}</span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(local)}
              style={{
                padding: '10px 20px', background: 'var(--accent)', color: '#000',
                border: 'none', borderRadius: 6, cursor: save.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
                opacity: save.isPending ? 0.6 : 1,
              }}
            >{save.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}</button>
            {saved && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green, #10b981)' }}>✓ Tercihler kaydedildi</span>}
            {save.isError && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
              {save.error?.response?.data?.error || 'Hata'}
            </span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 40, height: 22, padding: 2, borderRadius: 12,
        background: checked ? 'var(--accent)' : 'var(--border)',
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.15s ease', flexShrink: 0,
      }}
    >
      <span style={{
        display: 'block', width: 16, height: 16, borderRadius: '50%',
        background: '#fff',
        transform: checked ? 'translateX(18px)' : 'translateX(0)',
        transition: 'transform 0.15s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}
