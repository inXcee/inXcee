import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// G-prefix navigasyon (vim-style) + ? yardim modali.
// Form alanlari icinde tetiklenmez.

const G_NAV = {
  d: { path: '/', label: 'Dashboard' },
  m: { path: '/campus-map', label: 'Kampüs Haritası' },
  i: { path: '/checkin', label: 'Check-in' },
  o: { path: '/checkout', label: 'Check-out' },
  c: { path: '/capacity', label: 'Kapasiteler' },
  b: { path: '/bulk-actions', label: 'Toplu İşlem' },
  f: { path: '/companies', label: 'Firmalar' },
  v: { path: '/visitors', label: 'Ziyaretçiler' },
  s: { path: '/surveys', label: 'Memnuniyet' },
  t: { path: '/drills', label: 'Tatbikatlar' },
  p: { path: '/documents', label: 'Belgeler' },
  e: { path: '/expenses', label: 'Bütçe' },
  a: { path: '/automation', label: 'Otomasyon' },
  n: { path: '/notifications', label: 'Bildirimler' },
  r: { path: '/reports', label: 'Raporlar' },
  '?': { path: null, label: 'Yardım (bu pencere)' },
}

const OTHER = [
  { key: 'Ctrl + K', label: 'Komut paleti (her yerde)' },
  { key: 'Esc', label: 'Modal/popup kapat' },
  { key: 'g, sonra <harf>', label: 'Sayfaya git (aşağıdaki tablo)' },
  { key: '?', label: 'Bu yardım penceresi' },
]

export function GlobalShortcuts() {
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const gPressed = useRef(false)
  const gTimer = useRef(null)

  useEffect(() => {
    function handle(e) {
      // Form alani icinde es gec
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      // Modifier ile cakismayalim
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // ?-tusu help
      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(h => !h)
        return
      }

      // Esc help'i kapat
      if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false)
        return
      }

      // g-prefix
      if (gPressed.current) {
        const target = G_NAV[e.key.toLowerCase()]
        gPressed.current = false
        clearTimeout(gTimer.current)
        if (target?.path) {
          e.preventDefault()
          navigate(target.path)
        }
        return
      }
      if (e.key === 'g') {
        gPressed.current = true
        clearTimeout(gTimer.current)
        gTimer.current = setTimeout(() => { gPressed.current = false }, 1500)
      }
    }
    window.addEventListener('keydown', handle)
    return () => { window.removeEventListener('keydown', handle); clearTimeout(gTimer.current) }
  }, [navigate, helpOpen])

  if (!helpOpen) return null

  return (
    <div
      onClick={() => setHelpOpen(false)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, maxWidth: 560, width: '90%', maxHeight: '80vh', overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, letterSpacing: 3, color: 'var(--text)' }}>KLAVYE KISAYOLLARI</h2>
          <button
            onClick={() => setHelpOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer' }}
          >×</button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 8 }}>GENEL</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {OTHER.map(o => (
                <tr key={o.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    <kbd style={kbdStyle}>{o.key}</kbd>
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--text2)' }}>{o.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 8 }}>SAYFAYA GİT (G + HARF)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 12px' }}>
            {Object.entries(G_NAV).filter(([k]) => k !== '?').map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <kbd style={kbdStyle}>g {k}</kbd>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{v.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
          Kapatmak için <kbd style={kbdStyle}>Esc</kbd> veya dışına tıkla
        </div>
      </div>
    </div>
  )
}

const kbdStyle = {
  display: 'inline-block', padding: '2px 6px',
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 10,
  color: 'var(--accent)', minWidth: 24, textAlign: 'center',
}
