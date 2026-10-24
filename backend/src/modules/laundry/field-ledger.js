// Saha ekranı çamaşır defteri (docs/saha-ekrani.md): çamaşırhane ve kat hizmetleri telefondan/tabletten
// oda bazında "teslim al → hazır → teslim et" girer — Hermes /camasir ile aynı anlam: her laundry_items
// satırı bir TORBA (item_count=1, parça sayılmaz). Kayıt kiosk sistem kullanıcısı adına açılır; gerçek
// kişi last_modified_worker_id + geçmiş notu + audit_log'da. Tekil kıyafet takipli (individual) torbalar
// bu akışa girmez — onlar çamaşırhane ekranında parça parça ilerler.
import { getDB } from '../../shared/db/index.js'
import { istanbulDayBoundsUtc } from '../../shared/time.js'
import { getKioskSystemUserId } from '../avs-self-service/inventory-helpers.js'
import { AKSIYON, resolveScan } from './cardScan.js'
import { markReadyFromLedgerService } from './ledger.js'
import { createItemService, deleteItemService, deliverItemService, revertItemService } from './service.js'

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode })
const OPEN = ['dirty', 'washing', 'ironing']
const CARD_REASON = 'Saha ekranı' // kart zorunluyken kartsız geçiş gerekçesi
const LIST_LIMIT = 200

const workerName = (db, workerId) => db.prepare('SELECT full_name FROM staff WHERE id=?').get(workerId)?.full_name || `#${workerId}`

function audit(db, action, detail) {
  db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail) VALUES(NULL, ?, 'avs-self-service', ?, ?)`)
    .run(action, detail.roomId ?? null, JSON.stringify(detail))
}

function roomBags(db, roomId, statuses) {
  return db.prepare(`
    SELECT id FROM laundry_items
    WHERE room_id=? AND status IN (${statuses.map(() => '?').join(',')}) AND tracking_mode!='individual'
    ORDER BY id
  `).all(roomId, ...statuses).map(r => r.id)
}

function touch(db, ids, workerId, deliveredName) {
  const stmt = db.prepare(`
    UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now'),
      delivered_name=COALESCE(?, delivered_name) WHERE id=?
  `)
  for (const id of ids) stmt.run(workerId, deliveredName ?? null, id)
}

function groupByRoom(rows) {
  const groups = new Map()
  for (const r of rows) {
    let g = groups.get(r.room_id)
    if (!g) {
      g = { room_id: r.room_id, block: r.block, room_no: r.room_no, bags: 0, ironing: 0, urgent: 0, since: r.created_at, updated_at: r.updated_at, ids: [] }
      groups.set(r.room_id, g)
    }
    g.bags += 1
    g.ironing += r.needs_ironing ? 1 : 0
    g.urgent += r.urgent ? 1 : 0
    if (r.created_at < g.since) g.since = r.created_at
    if (r.updated_at > g.updated_at) g.updated_at = r.updated_at
    g.ids.push(r.id)
  }
  return [...groups.values()]
}

// Üç liste oda bazında: yıkamada (acil önce, en eski önce) · hazır · bugün teslim (İstanbul günü)
export function ledgerOverview(db = getDB()) {
  const { from, to } = istanbulDayBoundsUtc()
  const list = (where, params) => groupByRoom(db.prepare(`
    SELECT li.id, li.room_id, r.block, r.room_no, li.needs_ironing, li.urgent, li.created_at, li.updated_at
    FROM laundry_items li JOIN rooms r ON r.id=li.room_id
    WHERE li.tracking_mode!='individual' AND ${where}
    LIMIT ${LIST_LIMIT}
  `).all(...params))
  return {
    open: list("li.status IN ('dirty','washing','ironing') ORDER BY li.urgent DESC, li.created_at, li.id", []),
    ready: list("li.status='ready' ORDER BY li.updated_at, li.id", []),
    delivered_today: list("li.status='delivered' AND li.updated_at >= ? AND li.updated_at < ? ORDER BY li.updated_at DESC, li.id", [from, to]),
  }
}

// Teslim al: torba sayısı kadar satır. Aynı istemci anahtarı ikinci kez gelirse yeni satır açılmaz.
export function intakeBags({ roomId, bags, ironing = false, urgent = false, note = null, clientRequestId, workerId }, db = getDB()) {
  if (!Number.isInteger(bags) || bags < 1 || bags > 20) throw fail('Torba sayısı 1 ile 20 arasında olmalı', 400)
  const key = String(clientRequestId ?? '').trim()
  if (!key) throw fail('İstek anahtarı gerekli', 400)
  const room = db.prepare('SELECT id FROM rooms WHERE id=?').get(roomId)
  if (!room) throw fail('Oda bulunamadı', 404)
  const existing = db.prepare('SELECT id FROM laundry_items WHERE substr(client_request_id, 1, ?)=? ORDER BY id')
    .all(key.length + 1, `${key}#`).map(r => r.id)
  if (existing.length) return { ids: existing, already: true }

  const gate = resolveScan({ action: AKSIYON.INTAKE, room_id: room.id, override_reason: CARD_REASON }, db)
  if (!gate.allowed) throw fail(gate.message, 409)
  const systemUserId = getKioskSystemUserId()
  const historyNote = `Saha ekranı · ${workerName(db, workerId)}`
  const notes = ['Defter (Saha ekranı) · parça sayısı yazılmadı', String(note ?? '').trim()].filter(Boolean).join(' · ')
  const ids = db.transaction(() => {
    const out = []
    for (let i = 1; i <= bags; i += 1) {
      out.push(createItemService(
        { room_id: room.id, item_count: 1, notes, urgent: urgent ? 1 : 0, needs_ironing: ironing ? 1 : 0 },
        systemUserId,
        { cardScan: gate.scan, clientRequestId: `${key}#${i}`, workerId, historyNote },
      ).id)
    }
    audit(db, 'field_laundry_intake', { workerId, roomId: room.id, bags, ids: out })
    return out
  })()
  return { ids, already: false }
}

// Hazır: odanın yıkamadaki bütün torbaları rafa (makine/ütü adımı kaydedilmez — defter akışı)
export function markRoomReady({ roomId, workerId }, db = getDB()) {
  const ids = roomBags(db, roomId, OPEN)
  if (!ids.length) throw fail('Bu odada yıkamada torba yok', 404)
  const systemUserId = getKioskSystemUserId()
  const note = `Saha ekranı · ${workerName(db, workerId)}`
  db.transaction(() => {
    for (const id of ids) markReadyFromLedgerService(id, { note }, systemUserId)
    touch(db, ids, workerId)
    audit(db, 'field_laundry_ready', { workerId, roomId, ids })
  })()
  return { ids }
}

// Teslim: odanın hazır bütün torbaları; teslim alan yazılmazsa "Odaya bırakıldı"
export function deliverRoom({ roomId, name = null, workerId }, db = getDB()) {
  const ids = roomBags(db, roomId, ['ready'])
  if (!ids.length) throw fail('Bu odada hazır torba yok', 404)
  const deliveredTo = String(name ?? '').trim() || 'Odaya bırakıldı'
  const gate = resolveScan({ action: AKSIYON.DELIVERY, room_id: roomId, override_reason: CARD_REASON }, db)
  if (!gate.allowed) throw fail(gate.message, 409)
  const systemUserId = getKioskSystemUserId()
  db.transaction(() => {
    for (const id of ids) {
      deliverItemService(id, { delivered_to: deliveredTo, signature_data: null }, systemUserId, workerId, { cardScan: gate.scan })
    }
    touch(db, ids, workerId, deliveredTo)
    audit(db, 'field_laundry_deliver', { workerId, roomId, ids, delivered_to: deliveredTo })
  })()
  return { ids }
}

const UNDO = {
  intake: { from: 'dirty', run: (db, id, userId) => deleteItemService(id, userId) },
  ready: { from: 'ready', run: (db, id, userId) => revertItemService(id, 'dirty', userId) },
  deliver: {
    from: 'delivered',
    run: (db, id, userId) => {
      revertItemService(id, 'ready', userId)
      db.prepare('UPDATE laundry_items SET delivered_name=NULL WHERE id=?').run(id)
    },
  },
}

// Son adımı geri al: yalnız o adımı yapan kişi ve 24 saat içinde; hepsi ya da hiçbiri.
export function undoLedger({ action, ids, workerId }, db = getDB()) {
  const step = UNDO[action]
  if (!step) throw fail('Geçersiz işlem', 400)
  if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw fail('Geçersiz torba listesi', 400)
  const systemUserId = getKioskSystemUserId()
  return db.transaction(() => {
    const read = db.prepare(`
      SELECT id, status, tracking_mode, last_modified_worker_id AS worker,
             COALESCE(last_modified_at, created_at) >= datetime('now','-1 day') AS fresh
      FROM laundry_items WHERE id=?
    `)
    const rows = ids.map(id => read.get(id))
    if (rows.some(r => !r)) throw fail('Torba bulunamadı', 404)
    if (rows.some(r => Number(r.worker) !== Number(workerId))) throw fail('Yalnız kendi yaptığın adımı geri alabilirsin', 403)
    if (rows.some(r => !r.fresh)) throw fail('24 saatten eski adım — çamaşırhane ekranından düzeltilmeli', 403)
    if (rows.some(r => r.status !== step.from || r.tracking_mode === 'individual')) {
      throw fail('Torbanın durumu değişmiş; bu adım geri alınamaz', 409)
    }
    for (const r of rows) step.run(db, r.id, systemUserId)
    audit(db, 'field_laundry_undo', { workerId, action, ids: rows.map(r => r.id) })
    return { undone: rows.length }
  })()
}
