import { getDB } from '../../shared/db/index.js'

/**
 * Oda sakininin telefon numarasını sorgular ve WhatsApp mesajı gönderir.
 * Fire-and-forget: hata olursa akış durmaz, sadece loglanır.
 */
export async function notifyItemReady(itemId) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return

  try {
    const db = getDB()
    const item = db.prepare(`
      SELECT li.item_count, r.block, r.room_no,
             p.phone_number, p.full_name
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      LEFT JOIN room_assignments ra ON ra.room_id = r.id AND ra.check_out_at IS NULL
      LEFT JOIN personnel p ON p.id = ra.personnel_id
      WHERE li.id = ?
      LIMIT 1
    `).get(itemId)

    if (!item?.phone_number) return

    const phone = item.phone_number.replace(/\D/g, '')
    const firstName = item.full_name ? ' ' + item.full_name.split(' ')[0] : ''
    const msg = `Merhaba${firstName}!\n\nOda ${item.block}-${item.room_no} — ${item.item_count} parça çamaşırınız rafta hazır. Lütfen teslim alınız.`

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
          to: phone,
          type: 'text',
          text: { body: msg },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('[WhatsApp] Gönderim hatası:', err)
    }
  } catch (e) {
    console.error('[WhatsApp] Hata:', e.message)
  }
}
