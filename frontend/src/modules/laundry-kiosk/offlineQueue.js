// Kiosk çevrimdışı giriş kuyruğu — şantiye interneti koptuğunda torba
// girişleri localStorage'a alınır, bağlantı gelince sırayla gönderilir.
// Sadece GİRİŞ kuyruklanır (yeni kayıt, çakışma riski yok); durum geçişleri
// kuyruklanmaz (bayat veriyle yanlış geçiş riskli).
//
// GÜVENLİK: fotoğraf ve imza kuyruğa ALINMAZ. localStorage şifresizdir ve
// kiosk cihazı paylaşımlıdır; hassas veri hiç diske yazılmasın diye çevrimdışı
// girişte bu alanlar toplanmaz (bkz. EntryForm çevrimdışı uyarısı).
const KEY = 'kiosk-offline-bags'

export const MAX_QUEUE = 20
export const QUEUE_TTL_MS = 24 * 60 * 60 * 1000

function readRaw() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

// Okurken TTL uygulanır: bayat giriş sunucuya gitmesin (oda/kişi değişmiş olabilir).
export function listQueued() {
  const cutoff = Date.now() - QUEUE_TTL_MS
  return readRaw().filter(entry => {
    const at = Date.parse(entry?.queued_at || '')
    return Number.isFinite(at) ? at >= cutoff : false
  })
}

// Kota hatası YUTULMAZ — sessiz veri kaybı yerine çağıran kullanıcıya gösterir.
function save(q) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    throw new Error('Çevrimdışı kayıt kaydedilemedi — cihaz depolaması dolu')
  }
}

// entry: { payload: {...json alanları}, label: 'M1-205 · 3 parça' }
// photoDataUrl ve payload.intake_signature bilerek atılır (yukarıdaki güvenlik notu).
export function enqueueBag(entry) {
  const q = listQueued()
  if (q.length >= MAX_QUEUE) {
    throw new Error(`Çevrimdışı kuyruk dolu (${MAX_QUEUE} kayıt) — bağlantı gelince gönderin`)
  }
  const { photoDataUrl, payload = {}, ...rest } = entry
  const { intake_signature, ...safePayload } = payload
  q.push({ ...rest, payload: safePayload, queued_at: new Date().toISOString() })
  save(q)
  return q.length
}

export function removeQueuedAt(index) {
  const q = listQueued()
  q.splice(index, 1)
  save(q)
  return q
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// JSON alanlarını FormData'ya çevirir (objeler JSON string olur — backend parse eder).
// photoDataUrl yalnızca ÇEVRİMİÇİ gönderimde kullanılır; kuyruktan gelen kayıtta olmaz.
export function buildBagFormData(payload, photoDataUrl) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || v === undefined || v === '') continue
    fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  if (photoDataUrl) fd.append('photo', dataUrlToBlob(photoDataUrl), 'torba.jpg')
  return fd
}

// postFn(formData) → Promise. Ağ hatasında (response yok) kalanlar kuyrukta
// bekler; sunucu reddi (4xx) kuyruğu tıkamasın diye düşürülür ve raporlanır.
export async function flushQueue(postFn) {
  const q = listQueued()
  let sent = 0
  const rejected = []
  let i = 0
  for (; i < q.length; i++) {
    try {
      await postFn(buildBagFormData(q[i].payload))
      sent++
    } catch (err) {
      if (!err?.response) break // ağ yok — bu ve sonrakiler kuyrukta kalır
      rejected.push({ label: q[i].label, error: err.response?.data?.error || 'Reddedildi' })
    }
  }
  const remaining = q.slice(i) // ağ koptuysa: başarısız olan + denenmemişler kuyrukta kalır
  save(remaining)
  return { sent, rejected, remaining: remaining.length }
}
