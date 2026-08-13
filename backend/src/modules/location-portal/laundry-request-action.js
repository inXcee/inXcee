import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { createNotification } from '../../shared/notifications/service.js'
import { resolveAction, actionActor } from './public-actions.js'
import { recordPortalEvent, createOrGetPortalReceipt, findPortalReceipt } from './public-service.js'

// Faz 5 — Oda QR'ından çamaşır alma talebi.
//
// Sakin odadan çıkmadan "çamaşırım alınsın" diyebiliyor. Üç kural bu dosyayı
// taşıyor:
//
//  1. TALEP TESLİM DEĞİLDİR. Burada hiçbir laundry_items kaydı açılmaz. Torba
//     fiziksel olarak alınırken mevcut kart kapısı, gerekçe, imza ve premium
//     kuralları baştan uygulanır. Aksi hâlde sakin telefonundan çamaşırhane
//     kaydı açtırmış olurdu.
//
//  2. AÇIK TALEP BİRLEŞİR. Sabırsız sakin beş kez basınca çamaşırhaneye beş iş
//     düşmez; mevcut talep güncellenir, sayaç artar, notu eklenir.
//
//  3. ORTAK ALANDA TALEP YOK. Koridorun çamaşırı olmaz; QR ortak alandaysa
//     hizmet hiç gösterilmez.

function actionError(message, status, code) {
  const error = new Error(message)
  error.statusCode = status
  error.code = code
  return error
}

export function submitPortalLaundryRequest({ token, sessionToken, body = {}, ip }) {
  const { location, settings } = resolveAction(token, 'location_portal_laundry_enabled')

  // Koridorun/WC'nin çamaşırı olmaz; oda dışı konumda bu hizmet yok.
  if (location.location_type !== 'room') {
    throw actionError('Çamaşır talebi yalnız odalardan oluşturulabilir', 400, 'laundry_room_only')
  }

  const actor = actionActor(location, sessionToken, settings.location_portal_laundry_pin_required)

  const prior = findPortalReceipt({
    locationId: location.location_id,
    actionType: 'laundry_request',
    clientRequestId: body.client_request_id,
  })
  // Aynı client_request_id ikinci kez gelirse yeni talep açılmaz; ilk makbuz
  // döner. Zayıf bağlantıda tekrar gönderim sık olur.
  if (prior) {
    return { receipt: prior.receipt, status: prior.status, summary: prior.summary, replayed: true }
  }

  const db = getDB()
  const not = String(body.note || '').trim() || null
  const tahmin = Number.isFinite(Number(body.bag_estimate)) ? Math.max(1, Math.min(20, Number(body.bag_estimate))) : null

  const sonuc = db.transaction(() => {
    const acik = db.prepare(`
      SELECT id, request_count, note FROM laundry_pickup_requests
      WHERE service_location_id=? AND status='open'
    `).get(location.location_id)

    let requestId
    let merged = false

    if (acik) {
      merged = true
      requestId = acik.id
      // Yeni notu ezmek yerine ekliyoruz: ikinci talepte "bir torba daha var"
      // yazan sakinin bilgisi kaybolmamalı.
      const birlesikNot = [acik.note, not].filter(Boolean).join(' | ') || null
      db.prepare(`
        UPDATE laundry_pickup_requests
        SET request_count = request_count + 1,
            note = ?,
            bag_estimate = COALESCE(?, bag_estimate),
            personnel_id = COALESCE(?, personnel_id),
            identity_mode = CASE WHEN ?='resident_pin' THEN 'resident_pin' ELSE identity_mode END,
            updated_at = datetime('now')
        WHERE id=?
      `).run(birlesikNot, tahmin, actor.personnelId, actor.mode, requestId)
    } else {
      requestId = db.prepare(`
        INSERT INTO laundry_pickup_requests
          (service_location_id, room_id, personnel_id, identity_mode, note, bag_estimate, source)
        VALUES(?,?,?,?,?,?, 'room_qr')
      `).run(location.location_id, location.room_id || null, actor.personnelId,
        actor.mode, not, tahmin).lastInsertRowid
    }

    const eventId = recordPortalEvent({
      locationId: location.location_id,
      qrCodeId: location.qr_id,
      eventType: 'laundry_request',
      actorMode: actor.mode,
      actorPersonnelId: actor.personnelId,
      linkedEntityType: 'laundry_pickup_request',
      linkedEntityId: requestId,
      result: merged ? 'merged' : 'accepted',
      clientRequestId: body.client_request_id,
      ip,
      metadata: { bag_estimate: tahmin },
    })

    const created = createOrGetPortalReceipt({
      locationId: location.location_id,
      actionType: 'laundry_request',
      clientRequestId: body.client_request_id,
      eventId,
      status: merged ? 'merged' : 'accepted',
      publicPayload: {
        message: merged
          ? 'Zaten açık bir çamaşır talebiniz vardı, bilginiz ona eklendi'
          : 'Çamaşır alma talebiniz çamaşırhaneye iletildi',
        // Sakin "teslim ettim" sanmasın: talep ile teslim farkı burada yazılı.
        note: 'Bu bir taleptir; torbanız görevli tarafından alındığında teslim kaydı ayrıca yapılır.',
        request_status: 'open',
      },
    })

    return { requestId, merged, receipt: created.receipt }
  })()

  try {
    createNotification({
      message: sonuc.merged
        ? `Çamaşır talebi güncellendi: ${location.display_name}`
        : `Yeni çamaşır alma talebi: ${location.display_name}${not ? ` — ${not}` : ''}`,
      severity: 'info',
      module: 'laundry',
      target_role: 'laundry',
      event_kind: 'laundry.pickup.requested',
      entity_type: 'laundry_pickup_request',
      entity_id: sonuc.requestId,
      dedup_key: `room-qr-laundry-${sonuc.requestId}-${body.client_request_id}`,
    })
  } catch (error) {
    // Bildirim gidemezse talep yine de durur; sessizce yutmak yerine loglanır.
    logger.error({ err: error, requestId: sonuc.requestId }, '[RoomPortal] Çamaşırhane bildirimi gönderilemedi')
  }

  return {
    receipt: sonuc.receipt.receipt,
    status: sonuc.receipt.status,
    summary: sonuc.receipt.summary,
    merged: sonuc.merged,
    replayed: false,
  }
}

// Çamaşırhane ekranı: açık talepler. Torba alınınca kapatılır.
export function listOpenPickupRequests({ block = null } = {}, db = getDB()) {
  const kosul = ["r.status='open'"]
  const params = []
  if (block) { kosul.push('sl.block=?'); params.push(block) }
  try {
    return {
      available: true,
      items: db.prepare(`
        SELECT r.id, r.room_id, r.note, r.bag_estimate, r.request_count, r.identity_mode,
               r.created_at, r.updated_at,
               sl.display_name, sl.block, sl.floor,
               p.full_name AS resident_name
        FROM laundry_pickup_requests r
        JOIN service_locations sl ON sl.id = r.service_location_id
        LEFT JOIN personnel p ON p.id = r.personnel_id
        WHERE ${kosul.join(' AND ')}
        ORDER BY r.created_at
      `).all(...params),
    }
  } catch (err) {
    // Boş liste "talep yok" diye okunur; okunamadığını söylemek gerekir.
    return { available: false, reason: `Çamaşır talepleri okunamadı: ${err.message}`, items: [] }
  }
}

// Talebi kapat. Torba gerçekten alındıysa laundry_item_id ile bağlanır —
// böylece "talep vardı, torba nerede" sorusu cevaplanabilir.
export function closePickupRequest(id, { status = 'collected', laundryItemId = null, reason = null, userId = null } = {}, db = getDB()) {
  if (!['collected', 'cancelled', 'expired'].includes(status)) {
    throw actionError('Geçersiz kapatma durumu', 400, 'invalid_status')
  }
  const bilgi = db.prepare(`
    UPDATE laundry_pickup_requests
    SET status=?, laundry_item_id=COALESCE(?, laundry_item_id),
        collected_at=CASE WHEN ?='collected' THEN datetime('now') ELSE collected_at END,
        collected_by=?, cancelled_reason=?, updated_at=datetime('now')
    WHERE id=? AND status='open'
  `).run(status, laundryItemId, status, userId, reason, Number(id))
  if (!bilgi.changes) throw actionError('Açık talep bulunamadı', 404, 'request_not_found')
  return db.prepare('SELECT * FROM laundry_pickup_requests WHERE id=?').get(Number(id))
}
