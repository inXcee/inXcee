import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { createNotification } from '../../shared/notifications/service.js'
import { avsRoleGroup } from '../../shared/auth/avsRoles.js'
import {
  actionActor,
  resolveAction,
} from './public-actions.js'
import {
  createOrGetPortalReceipt,
  findPortalReceipt,
  recordPortalEvent,
} from './public-service.js'

const ROOM_CHECKLIST = Object.freeze([
  'floor_cleaned',
  'surfaces_wiped',
  'waste_removed',
  'bed_area_checked',
])
const COMMON_CHECKLIST = Object.freeze([
  'floor_cleaned',
  'surfaces_wiped',
  'waste_removed',
  'supplies_checked',
])

function cleaningError(message, statusCode, code) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function requiredChecklist(location) {
  return location.location_type === 'room' ? ROOM_CHECKLIST : COMMON_CHECKLIST
}

function pendingTask(db, location) {
  return db.prepare(`
    SELECT * FROM cleaning_tasks
    WHERE qr_location=? AND date(scheduled_at)=date('now','+3 hours')
      AND completed_at IS NULL AND COALESCE(skipped,0)=0
    ORDER BY scheduled_at DESC, id DESC
    LIMIT 1
  `).get(location.qr_location)
}

function latestLocationTask(db, location) {
  return db.prepare(`
    SELECT ct.*,
      (SELECT COUNT(*) FROM cleaning_task_photos p WHERE p.task_id=ct.id) AS proof_count,
      cr.outcome AS review_outcome, cr.rating AS review_rating,
      cr.followup_task_id
    FROM cleaning_tasks ct
    LEFT JOIN cleaning_task_reviews cr ON cr.task_id=ct.id
    WHERE ct.qr_location=? AND date(ct.scheduled_at)=date('now','+3 hours')
    ORDER BY
      CASE WHEN ct.completed_at IS NULL AND COALESCE(ct.skipped,0)=0 THEN 0
           WHEN ct.completed_at IS NOT NULL THEN 1 ELSE 2 END,
      ct.scheduled_at DESC, ct.id DESC
    LIMIT 1
  `).get(location.qr_location)
}

function receiptResponse(receipt, extra = {}) {
  return { ...extra, receipt: receipt.receipt, status: receipt.status, summary: receipt.summary }
}

function cleaningState(task) {
  if (!task) return 'none'
  if (task.completed_at) return 'completed'
  if (task.skipped) return 'skipped'
  return 'pending'
}

export function getPortalCleaningStatus({ token, ip }) {
  const { location, settings } = resolveAction(token, 'location_portal_cleaning_enabled')
  const task = latestLocationTask(getDB(), location)
  recordPortalEvent({
    locationId: location.location_id,
    qrCodeId: location.qr_id,
    eventType: 'cleaning_status',
    result: 'opened',
    ip,
    metadata: { state: cleaningState(task) },
  })
  return {
    state: cleaningState(task),
    checklist: requiredChecklist(location),
    review_pin_required: settings.location_portal_cleaning_review_pin_required,
    task: task ? {
      task_type: task.task_type,
      scheduled_date: String(task.scheduled_at).slice(0, 10),
      completed_at: task.completed_at || null,
      verified_by_qr: Boolean(task.verified_by_qr),
      proof_count: Number(task.proof_count || 0),
      review: task.review_outcome ? {
        outcome: task.review_outcome,
        rating: task.review_rating,
        follow_up_created: Boolean(task.followup_task_id),
      } : null,
    } : null,
  }
}

function authorizedCleaningWorker(db, workerId, location) {
  const worker = db.prepare(`
    SELECT s.id, s.full_name, s.assigned_block, s.is_active,
           d.name AS department_name
    FROM staff s
    LEFT JOIN departments d ON d.id=s.department_id
    WHERE s.id=? AND s.is_active=1
  `).get(Number(workerId))
  if (!worker || avsRoleGroup(worker.department_name) !== 'housekeeping') {
    throw cleaningError('Yalnız temizlik çalışanları bu işlemi tamamlayabilir', 403, 'cleaning_worker_required')
  }
  if (!worker.assigned_block || worker.assigned_block !== location.block) {
    throw cleaningError('Bu konum atanmış bloğunuzda değil', 403, 'worker_block_mismatch')
  }
  return worker
}

export function completePortalCleaning({ token, workerId, body, imageUrls, ip }) {
  const { location } = resolveAction(token, 'location_portal_cleaning_enabled')
  const db = getDB()
  const worker = authorizedCleaningWorker(db, workerId, location)
  const prior = findPortalReceipt({
    locationId: location.location_id,
    actionType: 'cleaning_complete',
    clientRequestId: body.client_request_id,
  })
  if (prior) return { ...receiptResponse(prior, { replayed: true }), keepImages: false }

  const required = requiredChecklist(location)
  if (!required.every(key => body.checklist?.[key] === true)) {
    throw cleaningError('Bütün temizlik kontrol maddeleri onaylanmalı', 400, 'checklist_incomplete')
  }
  if (imageUrls.length < 1 || imageUrls.length > 3) {
    throw cleaningError('Temizlik için 1–3 kanıt fotoğrafı gerekli', 400, 'cleaning_photos_required')
  }
  const task = pendingTask(db, location)
  if (!task) {
    const completed = db.prepare(`
      SELECT id FROM cleaning_tasks
      WHERE qr_location=? AND date(scheduled_at)=date('now','+3 hours') AND completed_at IS NOT NULL
      LIMIT 1
    `).get(location.qr_location)
    throw cleaningError(
      completed ? 'Bugünkü temizlik görevi zaten tamamlandı' : 'Bugün için temizlik görevi bulunamadı',
      completed ? 409 : 404,
      completed ? 'cleaning_already_completed' : 'cleaning_task_not_found',
    )
  }

  const result = db.transaction(() => {
    const checklist = Object.fromEntries(required.map(key => [key, true]))
    if (body.note) checklist.note = body.note
    const updated = db.prepare(`
      UPDATE cleaning_tasks
      SET completed_at=datetime('now'), completed_by_worker_id=?, verified_by_qr=1,
          skipped=0, skip_reason=NULL, checklist=?, photo_url=?
      WHERE id=? AND completed_at IS NULL
    `).run(worker.id, JSON.stringify(checklist), imageUrls[0], task.id)
    if (!updated.changes) throw cleaningError('Bugünkü temizlik görevi zaten tamamlandı', 409, 'cleaning_already_completed')

    const insertPhoto = db.prepare(`
      INSERT INTO cleaning_task_photos(
        task_id, photo_url, category, caption, sort_order, uploaded_by_staff_id
      ) VALUES(?,?,'sonrasi',?,?,?)
    `)
    imageUrls.forEach((url, index) => insertPhoto.run(task.id, url, body.note || null, index, worker.id))
    const eventId = recordPortalEvent({
      locationId: location.location_id,
      qrCodeId: location.qr_id,
      eventType: 'cleaning_complete',
      actorMode: 'worker',
      actorStaffId: worker.id,
      linkedEntityType: 'cleaning_task',
      linkedEntityId: task.id,
      result: 'completed',
      clientRequestId: body.client_request_id,
      ip,
      metadata: { photo_count: imageUrls.length, checklist_count: required.length },
    })
    const created = createOrGetPortalReceipt({
      locationId: location.location_id,
      actionType: 'cleaning_complete',
      clientRequestId: body.client_request_id,
      eventId,
      status: 'completed',
      publicPayload: { message: 'Temizlik QR ile doğrulanarak tamamlandı' },
    })
    return { receipt: created.receipt, taskId: task.id }
  })()

  try {
    createNotification({
      message: `QR ile temizlik tamamlandı: ${location.display_name}`,
      module: 'housekeeping',
      severity: 'info',
      target_role: 'campus_manager',
      event_kind: 'housekeeping.task.completed',
      entity_type: 'cleaning_task',
      entity_id: result.taskId,
      dedup_key: `room-qr-cleaning-${result.taskId}`,
    })
  } catch (error) {
    logger.error({ err: error, taskId: result.taskId }, '[RoomPortal] Temizlik bildirimi gönderilemedi')
  }
  return { ...receiptResponse(result.receipt, { replayed: false }), keepImages: true }
}

export function reviewPortalCleaning({ token, sessionToken, body, ip }) {
  const { location, settings } = resolveAction(token, 'location_portal_cleaning_enabled')
  const actor = actionActor(location, sessionToken, settings.location_portal_cleaning_review_pin_required)
  const prior = findPortalReceipt({
    locationId: location.location_id,
    actionType: 'cleaning_review',
    clientRequestId: body.client_request_id,
  })
  if (prior) return receiptResponse(prior, { replayed: true })

  const db = getDB()
  const task = db.prepare(`
    SELECT ct.* FROM cleaning_tasks ct
    WHERE ct.qr_location=? AND date(ct.scheduled_at)=date('now','+3 hours')
      AND ct.completed_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM cleaning_task_reviews cr WHERE cr.task_id=ct.id)
    ORDER BY ct.completed_at DESC, ct.id DESC LIMIT 1
  `).get(location.qr_location)
  if (!task) {
    const reviewed = db.prepare(`
      SELECT 1 FROM cleaning_tasks ct JOIN cleaning_task_reviews cr ON cr.task_id=ct.id
      WHERE ct.qr_location=? AND date(ct.scheduled_at)=date('now','+3 hours') LIMIT 1
    `).get(location.qr_location)
    throw cleaningError(
      reviewed ? 'Bu temizlik daha önce değerlendirildi' : 'Değerlendirilebilecek tamamlanmış temizlik bulunamadı',
      reviewed ? 409 : 404,
      reviewed ? 'cleaning_already_reviewed' : 'completed_cleaning_not_found',
    )
  }

  const result = db.transaction(() => {
    let followupTaskId = null
    if (body.outcome === 'issue') {
      followupTaskId = db.prepare(`
        INSERT INTO cleaning_tasks(area,block,floor,task_type,scheduled_at,qr_location)
        VALUES(?,?,?,?,datetime('now','+3 hours'),?)
      `).run(task.area, task.block, task.floor, task.task_type, task.qr_location).lastInsertRowid
    }
    const reviewId = db.prepare(`
      INSERT INTO cleaning_task_reviews(
        task_id,location_id,reviewer_personnel_id,identity_mode,
        outcome,rating,comment,followup_task_id
      ) VALUES(?,?,?,?,?,?,?,?)
    `).run(
      task.id,
      location.location_id,
      actor.personnelId,
      actor.mode,
      body.outcome,
      body.rating ?? null,
      body.comment || null,
      followupTaskId,
    ).lastInsertRowid
    const eventId = recordPortalEvent({
      locationId: location.location_id,
      qrCodeId: location.qr_id,
      eventType: 'cleaning_review',
      actorMode: actor.mode,
      actorPersonnelId: actor.personnelId,
      linkedEntityType: 'cleaning_task_review',
      linkedEntityId: reviewId,
      result: 'completed',
      clientRequestId: body.client_request_id,
      ip,
      metadata: { outcome: body.outcome, rating: body.rating ?? null, follow_up: Boolean(followupTaskId) },
    })
    const created = createOrGetPortalReceipt({
      locationId: location.location_id,
      actionType: 'cleaning_review',
      clientRequestId: body.client_request_id,
      eventId,
      status: 'completed',
      publicPayload: {
        message: body.outcome === 'issue'
          ? 'Eksik bildiriminiz alındı ve takip temizliği oluşturuldu'
          : 'Temizlik değerlendirmeniz kaydedildi',
        follow_up_created: Boolean(followupTaskId),
      },
    })
    return { receipt: created.receipt, followupTaskId, reviewId }
  })()

  if (result.followupTaskId) {
    try {
      createNotification({
        message: `QR temizlik eksik bildirimi: ${location.display_name}`,
        module: 'housekeeping',
        severity: 'warning',
        target_role: 'housekeeper',
        event_kind: 'housekeeping.deficiency.reported',
        entity_type: 'cleaning_task',
        entity_id: result.followupTaskId,
        dedup_key: `room-qr-cleaning-followup-${result.reviewId}`,
      })
    } catch (error) {
      logger.error({ err: error, reviewId: result.reviewId }, '[RoomPortal] Temizlik eksik bildirimi gönderilemedi')
    }
  }
  return receiptResponse(result.receipt, {
    replayed: false,
    follow_up_created: Boolean(result.followupTaskId),
  })
}
