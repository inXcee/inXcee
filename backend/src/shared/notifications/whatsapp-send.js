// WhatsApp Cloud API (Meta) ile outbound text mesaj gondermek icin servis.
//
// Konfigurasyon (env):
//   WHATSAPP_API_TOKEN      - Meta WhatsApp Business API access token
//   WHATSAPP_PHONE_ID       - Sender phone number ID (Meta Console'dan)
//   WHATSAPP_OUTBOUND       - 'true' ise gerçekten gönder; aksi halde sadece logla
//
// Konfigurasyon eksikse silently skip eder ({ sent: 0, skipped: 'not_configured' }).
// Bu sayede development'ta hatasiz calisir.

import { getDB } from '../db/index.js'

// Env'i her cagri da oku — test'te env degisirse hemen yansisin.
function readConfig() {
  return {
    token: process.env.WHATSAPP_API_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_ID,
    enabled: process.env.WHATSAPP_OUTBOUND === 'true',
  }
}

export function isWhatsAppConfigured() {
  const c = readConfig()
  return !!(c.token && c.phoneId && c.enabled)
}

// Telefon numarasini E.164 formatina cevirir (Turkiye odakli).
//   "+90 532 123 45 67" / "0532 123 45 67" / "5321234567" -> "905321234567"
export function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (digits.length === 0) return null
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('90')) return digits
  if (digits.startsWith('0')) return '90' + digits.slice(1)
  if (digits.length === 10) return '90' + digits // 5321234567 -> 905321234567
  return digits
}

function logOutbound(toPhone, message, status, errorMsg = null) {
  try {
    const db = getDB()
    db.prepare(`
      INSERT INTO whatsapp_outbound_log(to_phone, message, status, error)
      VALUES(?, ?, ?, ?)
    `).run(toPhone, message, status, errorMsg)
  } catch {
    // Tablo migration'i henuz yapilmadiysa veya hata olursa sessiz gec
  }
}

export async function sendWhatsAppText(rawPhone, message) {
  const phone = normalizePhone(rawPhone)
  if (!phone) return { sent: 0, skipped: 'invalid_phone' }
  const cfg = readConfig()
  if (!cfg.token || !cfg.phoneId || !cfg.enabled) {
    logOutbound(phone, message, 'skipped_not_configured')
    return { sent: 0, skipped: 'not_configured' }
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v17.0/${cfg.phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      logOutbound(phone, message, 'failed', `${res.status}: ${errText.slice(0, 200)}`)
      return { sent: 0, error: `${res.status}: ${errText.slice(0, 200)}` }
    }
    logOutbound(phone, message, 'sent')
    return { sent: 1 }
  } catch (e) {
    logOutbound(phone, message, 'failed', e.message)
    return { sent: 0, error: e.message }
  }
}

// User ID'den telefon bul ve gonder.
// A→Z Faz 9: Per-user dakika içinde MAX_PER_MINUTE'tan fazlasını gönderme;
// aşıldıysa kullanıcıya tek bir "X yeni bildirim daha var" özet mesajı düşür ve sonrakileri suskun geç.
const MAX_PER_MINUTE = 3
const WINDOW_MS = 60_000
// userId -> { times: number[], summaryAt: number, suppressedCount: number }
const rateMap = new Map()

function rateCheck(userId) {
  const now = Date.now()
  let entry = rateMap.get(userId)
  if (!entry) { entry = { times: [], summaryAt: 0, suppressedCount: 0 }; rateMap.set(userId, entry) }
  entry.times = entry.times.filter(t => now - t < WINDOW_MS)
  if (entry.times.length < MAX_PER_MINUTE) {
    entry.times.push(now)
    return { allowed: true, summary: false }
  }
  // Limit aşıldı — özet mesajı dakikada bir kez at
  entry.suppressedCount++
  if (now - entry.summaryAt >= WINDOW_MS) {
    entry.summaryAt = now
    const count = entry.suppressedCount
    entry.suppressedCount = 0
    return { allowed: false, summary: true, count }
  }
  return { allowed: false, summary: false }
}

export async function sendWhatsAppToUser(userId, message) {
  const db = getDB()
  const user = db.prepare('SELECT phone FROM users WHERE id=?').get(userId)
  if (!user?.phone) return { sent: 0, skipped: 'no_phone' }
  const r = rateCheck(userId)
  if (r.allowed) return sendWhatsAppText(user.phone, message)
  if (r.summary) {
    return sendWhatsAppText(user.phone, `[YYS] Dakikada ${MAX_PER_MINUTE}+ bildirim alındı (${r.count} bekliyor). Lütfen panele bakın.`)
  }
  return { sent: 0, skipped: 'rate_limited' }
}

// Test ortami / tests icin sifirla
export function _resetRateLimitForTests() { rateMap.clear() }
