// Web Push subscribe / unsubscribe helper'lari (Faz 3.b / M10).
//
// Akis: izin iste -> SW hazir mi kontrol -> VAPID key cek -> subscribe ->
// backend'e POST. Tum hatalar yutulur ve null doner; cagiran taraf UI
// guncellemesi yapar.

import mobileApi from '../../modules/mobile/auth/mobileApi.js'

export function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

export function getPushPermission() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export async function getCurrentSubscription() {
  if (!isPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch { return null }
}

// Permission iste, subscribe ol, backend'e kaydet. Hata durumunda null doner.
export async function subscribePush() {
  if (!isPushSupported()) return null
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const { data } = await mobileApi.get('/push/vapid-public-key')
      if (!data?.key) return null
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      })
    }
    await mobileApi.post('/push/subscribe', sub.toJSON())
    return sub
  } catch (e) {
    console.error('[Push] subscribe hatasi:', e?.message || e)
    return null
  }
}

export async function unsubscribePush() {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return true
    try { await mobileApi.post('/push/unsubscribe', { endpoint: sub.endpoint }) } catch {}
    await sub.unsubscribe()
    return true
  } catch (e) {
    console.error('[Push] unsubscribe hatasi:', e?.message || e)
    return false
  }
}
