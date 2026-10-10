import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'
import { createNotification } from '../../shared/notifications/service.js'
import * as q from './queries.js'
import { notifyItemReady } from './whatsapp.js'
import { deleteItemService } from './service.js'

// Kâğıt defter akışı (10 Eki 2026): çamaşırhane torbaları deftere yazıyor, makine/ütü
// adımları kaydedilmiyor. Defterden (Telegram /camasir) gelen "hazır" bilgisi torbayı
// makine adımı olmadan doğrudan rafa alır. Makine çalışıyorsa serbest bırakılır;
// tekil kıyafet takibindeki (kiosk) torbalar bu yoldan geçemez — onlar parça parça ilerler.
const FROM = new Set(['dirty', 'washing', 'ironing'])

export function markReadyFromLedgerService(id, { shelf_location = null, note = null } = {}, userId) {
  const db = getDB()
  const item = db.transaction(() => {
    const it = q.getItemQuery(id)
    if (!it) throw Object.assign(new Error('Kayıt bulunamadı'), { statusCode: 404 })
    if (!FROM.has(it.status)) throw new Error(`"${it.status}" durumundaki torba hazıra alınamaz`)
    if (it.tracking_mode === 'individual') {
      throw new Error('Tekil kıyafet takibindeki torba parça parça ilerletilmeli (çamaşırhane ekranı)')
    }
    if (it.status === 'washing' && it.machine_id) q.updateMachineQuery(it.machine_id, { status: 'done' })
    q.removeItemFromQueueQuery(id)
    q.updateItemStatusQuery(id, 'ready', { shelf_location: shelf_location || null })
    q.insertHistoryQuery({
      item_id: id, from_status: it.status, to_status: 'ready', action_by: userId,
      notes: ['Defter: hazır (makine adımı kaydedilmedi)', note].filter(Boolean).join(' · '),
    })
    return it
  }).immediate()

  createNotification({
    message: `${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça rafta hazır`,
    type: 'info', module: 'laundry', target_role: 'laundry', dedup_key: `laundry_ready_${id}`,
  })
  if (q.markReadyNotifiedQuery(id)) notifyItemReady(id).catch(() => {})
  logAudit(userId, 'laundry_ledger_ready', 'laundry', id, `${item.status} → ready (defter)`)
  return q.getItemQuery(id)
}

// Defterden yanlış açılan torbanın geri alınması: yalnız kendi açtığı, hâlâ sepette (dirty)
// ve 24 saati geçmemiş kayıt. Diğer silmeler çamaşırhane/müdür yetkisinde kalır.
export function cancelOwnLedgerItemService(id, userId) {
  const it = getDB().prepare(`SELECT id, status, created_by, created_at >= datetime('now','-1 day') AS fresh
                              FROM laundry_items WHERE id=?`).get(id)
  if (!it) throw Object.assign(new Error('Kayıt bulunamadı'), { statusCode: 404 })
  if (it.created_by !== userId) throw Object.assign(new Error('Yalnız kendi açtığın torbayı geri alabilirsin'), { statusCode: 403 })
  if (!it.fresh) throw new Error('24 saatten eski kayıt — çamaşırhane ekranından silinmeli')
  deleteItemService(id, userId)
  return { ok: true, id }
}
