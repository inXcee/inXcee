import { useEffect, useState } from 'react'

const DISMISS_KEY = 'pwa-install-dismissed-at'
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000 // 7 gün

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream
}

function recentlyDismissed() {
  try {
    const ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10)
    return ts && Date.now() - ts < DISMISS_TTL
  } catch { return false }
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS özel: beforeinstallprompt yok, manuel talimat ver
    if (isIos()) {
      // 5sn sonra göster (sayfaya alışınca)
      const t = setTimeout(() => { setIosHint(true); setShow(true) }, 5000)
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', handler) }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShow(false)
      setDeferredPrompt(null)
    } else {
      handleDismiss()
    }
  }

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16,
      maxWidth: 420, margin: '0 auto', zIndex: 1000,
      background: 'var(--surface)', border: '1px solid var(--accent)',
      borderRadius: 12, padding: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'fade-up 0.3s ease',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 40, height: 40, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), var(--accent3))',
          borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--display)', fontSize: 14, color: '#000', letterSpacing: 1,
        }}>YYS</div>
        <div style={{ flex: 1 }}>
          <h4 style={{
            fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2,
            color: 'var(--text)', margin: '0 0 4px 0',
          }}>UYGULAMAYI YÜKLE</h4>
          {iosHint ? (
            <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', margin: '0 0 8px 0', lineHeight: 1.5 }}>
              Safari'de <strong>Paylaş</strong> butonuna basın → <strong>Ana Ekrana Ekle</strong> seçin
            </p>
          ) : (
            <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', margin: '0 0 8px 0' }}>
              Ana ekrana ekleyerek tek dokunuşla erişin
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Kapat"
          style={{
            background: 'none', border: 'none', color: 'var(--text3)',
            fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1,
          }}
        >×</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {!iosHint && (
          <button
            type="button"
            onClick={handleInstall}
            style={{
              flex: 1, padding: '8px 14px', background: 'var(--accent)', color: '#000',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
            }}
          >+ EKLE</button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            flex: iosHint ? 1 : 0,
            padding: '8px 14px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1,
          }}
        >{iosHint ? 'TAMAM' : '7 GÜN GİZLE'}</button>
      </div>
    </div>
  )
}
