import { getDB } from '../db/index.js'
import { createNotification } from '../notifications/service.js'

// ── Fault Parser ─────────────────────────────────────────────────────────────
const BLOCK_PATTERN = /\b(M[1-3]|S[1-3])\b/i
const ROOM_PATTERN = /\b(?:oda\s*)?(\d{3})\b/i
const FAULT_KEYWORDS = [
  'arıza', 'bozuk', 'kırık', 'tıkalı', 'tıkanık', 'sızıntı', 'patlak',
  'çalışmıyor', 'yanmıyor', 'akmıyor', 'akıyor', 'yok', 'kopuk', 'düştü',
  'kaçak', 'sorun', 'problem', 'hata', 'acil', 'tamir', 'onarım',
]

export function parseFaultMessage(text) {
  if (!text) return null
  const lower = text.toLowerCase()
  const hasFaultKeyword = FAULT_KEYWORDS.some(kw => lower.includes(kw))
  if (!hasFaultKeyword) return null

  const blockMatch = text.match(BLOCK_PATTERN)
  const roomMatch = text.match(ROOM_PATTERN)
  const block = blockMatch ? blockMatch[1].toUpperCase() : null
  const roomNo = roomMatch ? roomMatch[1] : null
  const location = block && roomNo
    ? `${block} Oda ${roomNo}`
    : block
    ? `${block} (oda belirtilmedi)`
    : 'Konum belirtilmedi'

  return { location, description: text, block, roomNo }
}

// ── Submit messages (single or bulk paste) ──────────────────────────────────
export function submitMessages(rawText, sender, groupName) {
  const db = getDB()
  // Split by newlines — each line is a separate message
  const lines = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)
  const results = []

  for (const line of lines) {
    const parsed = parseFaultMessage(line)
    let faultId = null
    let parsedLocation = null

    if (parsed) {
      // Auto-create maintenance request
      const desc = `[WhatsApp — ${groupName}] ${sender}: ${parsed.description}`
      const r = db.prepare(`
        INSERT INTO maintenance_requests(location, description, priority, is_preventive)
        VALUES(?, ?, 'medium', 0)
      `).run(parsed.location, desc)
      faultId = Number(r.lastInsertRowid)
      parsedLocation = parsed.location

      createNotification({
        message: `WhatsApp'tan arıza: ${parsed.location} — ${parsed.description.slice(0, 80)}`,
        type: 'warning',
        module: 'whatsapp',
        target_role: 'technical',
      })
    }

    const ins = db.prepare(`
      INSERT INTO whatsapp_messages(sender, group_name, text, is_fault, fault_id, parsed_location)
      VALUES(?, ?, ?, ?, ?, ?)
    `).run(sender || 'Manuel Giriş', groupName || 'Genel', line, parsed ? 1 : 0, faultId, parsedLocation)

    results.push({
      id: Number(ins.lastInsertRowid),
      sender,
      groupName,
      text: line,
      isFault: !!parsed,
      faultId,
      parsedLocation,
    })
  }

  return results
}

// ── Get messages ────────────────────────────────────────────────────────────
export function getMessages(limit = 50) {
  const db = getDB()
  return db.prepare(`
    SELECT id, sender, group_name as groupName, text, is_fault as isFault,
           fault_id as faultId, parsed_location as parsedLocation, created_at as timestamp
    FROM whatsapp_messages ORDER BY id DESC LIMIT ?
  `).all(limit)
}

// ── Stats ───────────────────────────────────────────────────────────────────
export function getStats() {
  const db = getDB()
  const total = db.prepare('SELECT COUNT(*) as c FROM whatsapp_messages').get().c
  const faults = db.prepare('SELECT COUNT(*) as c FROM whatsapp_messages WHERE is_fault=1').get().c
  const today = new Date().toISOString().split('T')[0]
  const todayFaults = db.prepare(`
    SELECT COUNT(*) as c FROM whatsapp_messages WHERE is_fault=1 AND created_at >= ?
  `).get(today).c
  return { total, faults, todayFaults }
}

// ── Analyze text without saving (preview) ───────────────────────────────────
export function analyzeText(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)
  return lines.map(line => {
    const parsed = parseFaultMessage(line)
    return { text: line, isFault: !!parsed, location: parsed?.location || null }
  })
}
