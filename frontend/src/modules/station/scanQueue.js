// Okutma istasyonu çevrimdışı kuyruğu — ağ yokken okutmalar KAYBOLMAZ:
// localStorage'a yazılır, bağlantı gelince orijinal zamanıyla (scanned_at)
// sunucuya gönderilir. Desen: laundry offlineQueue (saf modül + unit test).
// Foto kuyruklanmaz (dataURL ağırlığı) — kuyruk kaydı uid+öğün+zaman taşır.

const KEY = 'yys_station_scan_queue'
const MAX_QUEUE = 500 // localStorage taşması guard'ı

export function loadQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(q) ? q : []
  } catch { return [] }
}

function saveQueue(q) {
  try { localStorage.setItem(KEY, JSON.stringify(q)) } catch { /* dolu — sessiz */ }
}

// → kuyruktaki eleman sayısı
export function enqueueScan({ raw_uid, meal_type = null }) {
  const q = loadQueue()
  if (q.length >= MAX_QUEUE) q.shift() // en eskiyi düşür, yeniyi koru
  q.push({ raw_uid, meal_type, scanned_at: new Date().toISOString() })
  saveQueue(q)
  return q.length
}

export function queueLength() { return loadQueue().length }

// Kuyruğu gönder: ok → çıkar, 4xx → düşür (kalıcı ret kuyruğu tıkamasın),
// 5xx/ağ hatası → kalsın (sonra tekrar denenir)
export async function flushQueue(stationKey, fetcher = (...a) => fetch(...a)) {
  const q = loadQueue()
  if (q.length === 0) return { sent: 0, dropped: 0, remaining: 0 }
  let sent = 0, dropped = 0
  const remaining = []
  for (const item of q) {
    try {
      const fd = new FormData()
      fd.append('raw_uid', item.raw_uid)
      if (item.meal_type) fd.append('meal_type', item.meal_type)
      fd.append('scanned_at', item.scanned_at)
      const res = await fetcher('/api/stations/scan', {
        method: 'POST', headers: { 'X-Station-Key': stationKey }, body: fd,
      })
      if (res.ok) sent++
      else if (res.status >= 400 && res.status < 500) dropped++
      else remaining.push(item)
    } catch {
      remaining.push(item)
    }
  }
  saveQueue(remaining)
  return { sent, dropped, remaining: remaining.length }
}
