import { useEffect, useState } from 'react'
import { isPushSupported, getPushPermission, subscribePush, getCurrentSubscription } from '../../../shared/utils/pushSubscribe.js'
import { useToastStore } from '../../../shared/store/toastStore.js'

const DISMISS_KEY = 'yys.push.dismissed.v1'

// Mobile uygulamayi acan kullaniciya "Bildirim aliniz mi?" tek sefer soran banner.
// Kapatildiginda local'de saklanir, bir daha sorulmaz. Permission denied/granted
// durumunda da gosterilmez.
export default function PushBanner() {
  const [shouldShow, setShouldShow] = useState(false)
  const { addToast } = useToastStore()

  useEffect(() => {
    if (!isPushSupported()) return
    if (getPushPermission() !== 'default') return
    if (localStorage.getItem(DISMISS_KEY)) return
    let mounted = true
    getCurrentSubscription().then(sub => {
      if (mounted && !sub) setShouldShow(true)
    })
    return () => { mounted = false }
  }, [])

  if (!shouldShow) return null

  const onAllow = async () => {
    setShouldShow(false)
    const sub = await subscribePush()
    if (sub) addToast('Bildirimler aktif', 'success')
    else addToast('Bildirim izni alinamadi', 'error')
  }
  const onDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShouldShow(false)
  }

  return (
    <div style={{
      position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 24px)', maxWidth: '460px', zIndex: 150,
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <span style={{ fontSize: '24px' }}>🔔</span>
      <div style={{ flex: 1, fontSize: '12px', color: '#374151', lineHeight: 1.3 }}>
        <strong style={{ display: 'block', marginBottom: '2px', fontSize: '13px' }}>Bildirim almak ister misiniz?</strong>
        Acil arıza ve görev bildirimleri uygulama kapalıyken de gelir.
      </div>
      <button onClick={onDismiss} aria-label="Kapat" style={{
        background: 'none', border: 'none', color: '#9ca3af', fontSize: '18px',
        cursor: 'pointer', padding: '4px 8px',
      }}>✕</button>
      <button onClick={onAllow} style={{
        background: '#3b82f6', color: '#fff', border: 'none',
        padding: '8px 14px', borderRadius: '8px', fontSize: '12px',
        fontWeight: 600, cursor: 'pointer', flexShrink: 0,
      }}>İzin Ver</button>
    </div>
  )
}
