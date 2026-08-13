import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logger } from '../../shared/logger.js'
import { getPortalSettings, resolveLocationToken } from './service.js'
import {
  createOrGetPortalReceipt,
  findPortalReceipt,
  recordPortalEvent,
  verifyPortalSession,
} from './public-service.js'

function actionError(message, statusCode, code) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

export function resolveAction(token, settingKey) {
  const location = resolveLocationToken(token)
  if (!location) throw actionError('QR kodu bulunamadı', 404, 'unknown_qr')
  if (location.qr_status !== 'active' || !location.is_active) {
    throw actionError('Bu QR kodu artık geçerli değil', 410, 'inactive_qr')
  }
  const settings = getPortalSettings()
  if (!settings.location_portal_enabled) throw actionError('Oda hizmet portalı şu anda kapalı', 503, 'portal_disabled')
  if (!settings[settingKey]) throw actionError('Bu hizmet şu anda kapalı', 404, 'action_disabled')
  return { location, settings }
}

export function actionActor(location, sessionToken, required) {
  if (!sessionToken) {
    if (required) throw actionError('Bu işlem için oda sakini doğrulaması gerekli', 401, 'resident_session_required')
    return { mode: 'anonymous', personnelId: null }
  }
  const session = verifyPortalSession(sessionToken, location.location_id)
  if (!session) throw actionError('Oturum geçersiz veya süresi dolmuş', 401, 'resident_session_invalid')
  return { mode: 'resident_pin', personnelId: session.personnel_id }
}

function receiptResponse(receipt, extra = {}) {
  return { ...extra, receipt: receipt.receipt, status: receipt.status, summary: receipt.summary }
}

export function submitPortalFault({ token, sessionToken, body, imageUrls, ip }) {
  const { location, settings } = resolveAction(token, 'location_portal_fault_enabled')
  const actor = actionActor(location, sessionToken, settings.location_portal_fault_pin_required)
  const prior = findPortalReceipt({
    locationId: location.location_id,
    actionType: 'fault',
    clientRequestId: body.client_request_id,
  })
  if (prior) return { ...receiptResponse(prior, { replayed: true }), keepImages: false }

  const db = getDB()
  const result = db.transaction(() => {
    const open = db.prepare(`
      SELECT id FROM maintenance_requests
      WHERE service_location_id=? AND category=? AND status!='done'
      ORDER BY id LIMIT 1
    `).get(location.location_id, body.category)

    let requestId
    let merged = false
    if (open) {
      requestId = open.id
      merged = true
      db.prepare(`
        INSERT INTO maintenance_comments(request_id, user_id, comment, photo_url)
        VALUES(?,NULL,?,?)
      `).run(requestId, `[Oda QR] ${body.description}`, imageUrls[0] || null)
    } else {
      requestId = db.prepare(`
        INSERT INTO maintenance_requests(
          location, block, room_id, description, status, priority,
          reporter_personnel_id, photo_before, sla_deadline, category,
          service_location_id, request_source, identity_mode
        ) VALUES(?,?,?,?,'open','medium',?,?,datetime('now','+24 hours'),?,?, 'room_qr',?)
      `).run(
        location.display_name,
        location.block,
        location.room_id || null,
        body.description,
        actor.personnelId,
        imageUrls[0] || null,
        body.category,
        location.location_id,
        actor.mode,
      ).lastInsertRowid
    }

    for (let index = 1; index < imageUrls.length; index += 1) {
      db.prepare(`
        INSERT INTO maintenance_comments(request_id, user_id, comment, photo_url)
        VALUES(?,NULL,?,?)
      `).run(requestId, `[Oda QR] Ek fotoğraf ${index + 1}`, imageUrls[index])
    }

    const addMedia = db.prepare(`
      INSERT INTO maintenance_request_media(request_id,file_url,source,added_by_personnel_id)
      VALUES(?,?,'room_qr',?)
    `)
    for (const url of imageUrls) addMedia.run(requestId, url, actor.personnelId)

    const eventId = recordPortalEvent({
      locationId: location.location_id,
      qrCodeId: location.qr_id,
      eventType: 'fault',
      actorMode: actor.mode,
      actorPersonnelId: actor.personnelId,
      linkedEntityType: 'maintenance_request',
      linkedEntityId: requestId,
      result: merged ? 'merged' : 'accepted',
      clientRequestId: body.client_request_id,
      ip,
      metadata: { category: body.category, photo_count: imageUrls.length },
    })
    const created = createOrGetPortalReceipt({
      locationId: location.location_id,
      actionType: 'fault',
      clientRequestId: body.client_request_id,
      eventId,
      status: merged ? 'merged' : 'accepted',
      publicPayload: {
        message: merged ? 'Bildiriminiz mevcut açık arızaya eklendi' : 'Arıza bildiriminiz teknik ekibe iletildi',
        request_status: 'open',
      },
    })
    return { requestId, merged, receipt: created.receipt }
  })()

  try {
    createNotification({
      message: result.merged
        ? `QR arıza #${result.requestId} için yeni bilgi: ${location.display_name}`
        : `Yeni QR arıza bildirimi: ${location.display_name} — ${body.description}`,
      severity: 'warning',
      module: 'maintenance',
      target_role: 'technical',
      event_kind: 'maintenance.request.created',
      entity_type: 'maintenance_request',
      entity_id: result.requestId,
      dedup_key: `room-qr-fault-${result.requestId}-${body.client_request_id}`,
    })
  } catch (error) {
    logger.error({ err: error, requestId: result.requestId }, '[RoomPortal] Teknik bildirim gönderilemedi')
  }

  return {
    ...receiptResponse(result.receipt, { merged: result.merged, replayed: false }),
    keepImages: true,
  }
}

export function submitPortalSurvey({ token, sessionToken, body, ip }) {
  const { location } = resolveAction(token, 'location_portal_survey_enabled')
  const actor = actionActor(location, sessionToken, false)
  const prior = findPortalReceipt({
    locationId: location.location_id,
    actionType: 'survey',
    clientRequestId: body.client_request_id,
  })
  if (prior) return receiptResponse(prior, { replayed: true })

  const db = getDB()
  return db.transaction(() => {
    const surveyId = db.prepare(`
      INSERT INTO satisfaction_surveys(
        personnel_id, room_score, cleaning_score, food_score, laundry_score,
        overall_score, comment, service_location_id, survey_source, identity_mode
      ) VALUES(?,?,?,?,?,?,?,?, 'room_qr',?)
    `).run(
      actor.personnelId,
      body.room_score ?? null,
      body.cleaning_score ?? null,
      body.food_score ?? null,
      body.laundry_score ?? null,
      body.overall_score ?? null,
      body.comment || null,
      location.location_id,
      actor.mode,
    ).lastInsertRowid
    const eventId = recordPortalEvent({
      locationId: location.location_id,
      qrCodeId: location.qr_id,
      eventType: 'survey',
      actorMode: actor.mode,
      actorPersonnelId: actor.personnelId,
      linkedEntityType: 'satisfaction_survey',
      linkedEntityId: surveyId,
      result: 'completed',
      clientRequestId: body.client_request_id,
      ip,
    })
    const created = createOrGetPortalReceipt({
      locationId: location.location_id,
      actionType: 'survey',
      clientRequestId: body.client_request_id,
      eventId,
      status: 'completed',
      publicPayload: { message: 'Görüşünüz kaydedildi. Teşekkür ederiz.' },
    })
    return receiptResponse(created.receipt, { replayed: false })
  })()
}
