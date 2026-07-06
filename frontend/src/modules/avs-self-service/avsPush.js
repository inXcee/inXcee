// AVS kiosk web-push opt-in — kişisel telefonda bildirim almak isteyen personel için.
// Paylaşılan terminalde kimse abone olmaz (buton aktif basılmadıkça no-op).
// shared/utils/pushSubscribe.js mobil app'e (mobileApi + /push) bağlı olduğu için
// AVS endpoint'leri (avsApi + /avs-self-service/push) ile ayrı bir akış gerekiyor.
import { isPushSupported, getCurrentSubscription } from '../../shared/utils/pushSubscribe.js'

export { isPushSupported, getCurrentSubscription }

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

// İzin iste → VAPID key çek → subscribe → AVS backend'e kaydet.
// Başarıda subscription döner, aksi halde null. Tüm hatalar yutulur.
export async function subscribeAvsPush(avsApi) {
  if (!isPushSupported()) return null
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const { data } = await avsApi.get('/avs-self-service/push/vapid-public-key')
      if (!data?.key) return null
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      })
    }
    await avsApi.post('/avs-self-service/push/subscribe', sub.toJSON())
    return sub
  } catch {
    return null
  }
}

export async function unsubscribeAvsPush(avsApi) {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return true
    try { await avsApi.post('/avs-self-service/push/unsubscribe', { endpoint: sub.endpoint }) } catch { /* yoksay */ }
    await sub.unsubscribe()
    return true
  } catch {
    return false
  }
}
