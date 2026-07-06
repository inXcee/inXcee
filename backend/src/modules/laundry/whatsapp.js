import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'

/**
 * Ham WhatsApp mesajı gönderir.
 * Fire-and-forget kullanımı için: sendWhatsApp(...).catch(() => {})
 */
export async function sendWhatsApp(phone, text) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return
  const normalized = phone.replace(/\D/g, '').replace(/^0/, '90')
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalized,
        type: 'text',
        text: { body: text },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[WhatsApp] Gönderim hatası: ${err}`)
  }
}

/**
 * Oda sakininin telefon numarasını sorgular ve WhatsApp mesajı gönderir.
 * Fire-and-forget: hata olursa akış durmaz, sadece loglanır.
 */
export async function notifyItemReady(itemId) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return

  try {
    const db = getDB()
    const item = db.prepare(`
      SELECT li.item_count, li.shelf_location, r.block, r.room_no,
             p.phone_number, p.full_name
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      LEFT JOIN room_assignments ra ON ra.room_id = r.id AND ra.check_out_at IS NULL
      LEFT JOIN personnel p ON p.id = ra.personnel_id
      WHERE li.id = ?
      LIMIT 1
    `).get(itemId)

    if (!item?.phone_number) return

    const firstName = item.full_name ? ' ' + item.full_name.split(' ')[0] : ''
    const shelfInfo = item.shelf_location ? ` · Raf: ${item.shelf_location}` : ''
    const msg = `Merhaba${firstName}!\n\nOda ${item.block}-${item.room_no} — ${item.item_count} parça çamaşırınız rafta hazır${shelfInfo}. Lütfen teslim alınız.`

    await sendWhatsApp(item.phone_number, msg)
  } catch (e) {
    logger.error('[WhatsApp] Hata:', e.message)
  }
}

/**
 * SLA ihlali olan kaydın sakinini WhatsApp ile bilgilendirir.
 * Aynı gün aynı aşama için yalnızca bir kez gönderir (laundry_sla_notifications).
 */
export async function sendSlaAlert(itemId, hours, db) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return

  try {
    const item = db.prepare(`
      SELECT li.item_count, li.status, r.block, r.room_no,
             p.phone_number, p.full_name
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      LEFT JOIN room_assignments ra ON ra.room_id = r.id AND ra.check_out_at IS NULL
      LEFT JOIN personnel p ON p.id = ra.personnel_id
      WHERE li.id = ?
      LIMIT 1
    `).get(itemId)

    if (!item?.phone_number) return

    const stageLabel = {
      dirty: 'Kirli sepette', washing: 'Makinede',
      ironing: 'Ütü aşamasında', ready: 'Rafta hazır',
    }[item.status] || item.status
    const firstName = item.full_name ? ' ' + item.full_name.split(' ')[0] : ''
    const msg = `Merhaba${firstName}!\n\nOda ${item.block || '?'}-${item.room_no || '?'} — ${item.item_count} parça çamaşırınız ${stageLabel} ${hours} saattir bekliyor. Lütfen işlem yapınız.`

    await sendWhatsApp(item.phone_number, msg)
    db.prepare(`INSERT OR IGNORE INTO laundry_sla_notifications(item_id, stage, phone)
      VALUES (?, ?, ?)`).run(itemId, item.status, item.phone_number)
  } catch (e) {
    logger.error('[WhatsApp] SLA alert error:', e.message)
  }
}

/**
 * O gün bu item+stage için daha önce bildirim gönderilip gönderilmediğini kontrol eder.
 */
export function shouldSendSlaNotification(db, itemId, stage) {
  const row = db.prepare(`
    SELECT id FROM laundry_sla_notifications
    WHERE item_id = ? AND stage = ? AND date(sent_at) = date('now')
  `).get(itemId, stage)
  return !row
}

/**
 * Bir odadaki belirli bir sakinin 'ready' durumdaki torbaları için hatırlatıcı gönderir.
 * Faz 4 — Odalar detay panel WhatsApp aksiyonu.
 * Yetki çağıran tarafa ait — burada sadece DB sorgusu + gönderim.
 */
export async function notifyRoomPersonReady(block, room_no, personName) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    return { configured: false, sent: 0 }
  }
  const db = getDB()
  const person = db.prepare(`
    SELECT p.id, p.phone_number, p.full_name
    FROM personnel p
    JOIN room_assignments ra ON ra.personnel_id = p.id AND ra.check_out_at IS NULL
    JOIN rooms r ON r.id = ra.room_id
    WHERE r.block = ? AND r.room_no = ? AND p.full_name = ?
    LIMIT 1
  `).get(block, room_no, personName)

  if (!person?.phone_number) return { configured: true, sent: 0, reason: 'phone_missing' }

  const readyItems = db.prepare(`
    SELECT li.id, li.bag_no, li.item_count, li.shelf_location
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    WHERE r.block = ? AND r.room_no = ?
      AND li.status = 'ready'
      AND (li.intake_name = ? OR li.intake_name IS NULL)
    ORDER BY li.created_at ASC
  `).all(block, room_no, personName)

  if (readyItems.length === 0) return { configured: true, sent: 0, reason: 'no_ready_items' }

  const firstName = person.full_name ? ' ' + person.full_name.split(' ')[0] : ''
  const lines = readyItems.map(it => {
    const shelf = it.shelf_location ? ` · Raf: ${it.shelf_location}` : ''
    return `• ${it.bag_no || `#${it.id}`} — ${it.item_count} parça${shelf}`
  }).join('\n')
  const msg = `Merhaba${firstName}!\n\nOda ${block}-${room_no} için rafta hazır çamaşırlarınız:\n${lines}\n\nLütfen teslim alınız.`

  try {
    await sendWhatsApp(person.phone_number, msg)
    return { configured: true, sent: readyItems.length }
  } catch (e) {
    logger.error('[WhatsApp] notifyRoomPersonReady error:', e.message)
    return { configured: true, sent: 0, error: e.message }
  }
}

export async function sendFoundMessage(item) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return

  try {
    const phone = (item.phone_number || '').replace(/\D/g, '')
    if (!phone) return

    const name = item.full_name || item.intake_name || ''
    const firstName = name ? ' ' + name.split(' ')[0] : ''
    const shelf = item.shelf_location ? `Raf: ${item.shelf_location}.` : ''
    const msg = `Merhaba${firstName}!\n\nKayıp olarak bildirilen ${item.item_count} parça çamaşırınız bulundu. ${shelf}\nTeslim için çamaşırhaneye gelebilirsiniz.`

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: msg } }),
      }
    )
    if (!res.ok) logger.error('[WhatsApp] Found msg error:', await res.text())
  } catch (e) {
    logger.error('[WhatsApp] sendFoundMessage error:', e.message)
  }
}
