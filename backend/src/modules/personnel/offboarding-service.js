import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logger } from '../../shared/logger.js'
import { startChecklist } from '../hr/queries.js'
import { recordPersonnelEvent } from './tracking-events.js'

const EXIT_TYPES = new Set(['resignation', 'employer_termination', 'contract_end', 'project_end', 'other'])
const FUTURE_ACTIONS = new Set(['cancel', 'keep'])
const LEAVE_ACTIONS = new Set(['cancel', 'truncate', 'keep'])

function fail(message, statusCode = 400, details = undefined) {
  return Object.assign(new Error(message), { statusCode, details })
}

function positiveId(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw fail(`${label} gecersiz`)
  return parsed
}

function isoDate(value, label) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw fail(`${label} YYYY-MM-DD olmali`)
  return normalized
}

function todayLocal(db) {
  return db.prepare("SELECT date('now', 'localtime') AS value").get().value
}

function getStaff(db, staffId) {
  const row = db.prepare(`
    SELECT s.*, d.name AS department_name, p.name AS project_name, r.name AS role_name
    FROM staff s
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN staff_roles r ON r.id=s.role_id
    WHERE s.id=?
  `).get(staffId)
  if (!row) throw fail('Personel bulunamadi', 404)
  return row
}

function notifyManagement(staffId, message, severity, dedupSuffix) {
  for (const role of ['campus_manager', 'shift_supervisor']) {
    try {
      createNotification({
        message,
        severity,
        module: 'personnel',
        target_role: role,
        entity_type: 'staff',
        entity_id: staffId,
        link: `/shifts/personnel/${staffId}?tab=hr`,
        dedup_key: `personnel:${dedupSuffix}:${staffId}:${role}`,
      })
    } catch (error) {
      logger.warn({ error: error.message, staffId, role }, '[offboarding] bildirim gonderilemedi')
    }
  }
}

function listOutstandingEquipment(db, staffId) {
  return db.prepare(`
    SELECT ic.id, 'inventory' AS source_type, i.item_name AS label,
      (ic.quantity-COALESCE(ic.returned_qty,0)) AS quantity,
      ic.checked_out_at AS issued_at
    FROM inventory_checkouts ic
    JOIN inventory i ON i.id=ic.item_id
    WHERE ic.staff_id=? AND ic.returned_at IS NULL
      AND (ic.quantity-COALESCE(ic.returned_qty,0))>0
    UNION ALL
    SELECT ka.id, 'kkd', ka.item_type, 1, ka.assigned_at
    FROM kkd_assignments ka
    WHERE ka.staff_id=? AND ka.returned_at IS NULL
    UNION ALL
    SELECT ui.id, 'uniform', COALESCE(items.label, ui.item_key), ui.quantity, ui.issued_at
    FROM staff_uniform_issues ui
    LEFT JOIN uniform_items items ON items.item_key=ui.item_key
    WHERE ui.staff_id=? AND ui.returned_at IS NULL
    ORDER BY issued_at
  `).all(staffId, staffId, staffId)
}

function checklistImpact(db, staffId) {
  const row = db.prepare(`
    SELECT c.id, c.status, c.started_at, c.completed_at,
      COUNT(i.id) AS total_count,
      COALESCE(SUM(CASE WHEN i.done=1 THEN 1 ELSE 0 END),0) AS completed_count
    FROM hr_checklists c
    LEFT JOIN hr_checklist_items i ON i.checklist_id=c.id
    WHERE c.staff_id=? AND c.kind='offboarding'
    GROUP BY c.id
    ORDER BY (c.status='open') DESC, c.started_at DESC, c.id DESC
    LIMIT 1
  `).get(staffId)
  return row || null
}

export function getOffboardingImpact(staffId, exitDate) {
  const db = getDB()
  const normalizedStaffId = positiveId(staffId, 'Personel kimligi')
  const normalizedExitDate = isoDate(exitDate, 'Son calisma tarihi')
  const staff = getStaff(db, normalizedStaffId)

  const schedules = db.prepare(`
    SELECT ss.id, ss.work_date, ss.status, ss.leave_type, ss.shift_def_id,
      sd.name AS shift_name, wl.name AS work_location_name
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
    LEFT JOIN work_locations wl ON wl.id=ss.work_location_id
    WHERE ss.staff_id=? AND ss.work_date>?
    ORDER BY ss.work_date, ss.id
  `).all(normalizedStaffId, normalizedExitDate)

  const leaves = db.prepare(`
    SELECT id, leave_type, start_date, end_date, total_days, reason, status
    FROM leave_requests
    WHERE staff_id=? AND end_date>? AND status IN ('pending','approved')
    ORDER BY start_date, id
  `).all(normalizedStaffId, normalizedExitDate)

  const overtimeRequests = db.prepare(`
    SELECT id, work_date, requested_hours, reason, status
    FROM overtime_requests
    WHERE staff_id=? AND work_date>? AND status IN ('pending','returned')
    ORDER BY work_date, id
  `).all(normalizedStaffId, normalizedExitDate)

  const followups = db.prepare(`
    SELECT id, title, priority, assigned_user_id, due_at, status
    FROM staff_followups
    WHERE staff_id=? AND status='open'
    ORDER BY due_at IS NULL, due_at, id
  `).all(normalizedStaffId)

  const futureAssignments = db.prepare(`
    SELECT id, project_id, department_id, role_id, work_location_id,
      effective_from, effective_to, note
    FROM staff_assignments
    WHERE staff_id=? AND effective_from>?
    ORDER BY effective_from, id
  `).all(normalizedStaffId, normalizedExitDate)
  const equipment = listOutstandingEquipment(db, normalizedStaffId)

  return {
    staff: {
      id: staff.id,
      full_name: staff.full_name,
      is_active: staff.is_active,
      offboarding_started_at: staff.offboarding_started_at,
      exit_date: staff.exit_date,
      exit_type: staff.exit_type,
      project_name: staff.project_name,
      department_name: staff.department_name,
      role_name: staff.role_name,
    },
    exit_date: normalizedExitDate,
    schedules,
    leaves,
    overtime_requests: overtimeRequests,
    future_assignments: futureAssignments,
    equipment,
    followups,
    checklist: checklistImpact(db, normalizedStaffId),
    counts: {
      schedules: schedules.length,
      leaves: leaves.length,
      overtime_requests: overtimeRequests.length,
      future_assignments: futureAssignments.length,
      equipment: equipment.length,
      followups: followups.length,
    },
  }
}

export function startOffboarding(staffId, data, actorUserId) {
  const db = getDB()
  const normalizedStaffId = positiveId(staffId, 'Personel kimligi')
  const exitDate = isoDate(data.exit_date, 'Son calisma tarihi')
  const exitType = String(data.exit_type || '')
  const reason = String(data.reason || '').trim()
  const ownerUserId = positiveId(data.owner_user_id || actorUserId, 'Cikis sorumlusu')
  if (!EXIT_TYPES.has(exitType)) throw fail('Cikis turu gecersiz')
  if (!reason) throw fail('Cikis aciklamasi zorunlu')
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(ownerUserId)) throw fail('Cikis sorumlusu bulunamadi')

  const save = db.transaction(() => {
    const staff = getStaff(db, normalizedStaffId)
    if (!staff.is_active) throw fail('Pasif personel icin cikis sureci baslatilamaz', 409)
    if (staff.offboarding_started_at) throw fail('Personel zaten cikis surecinde', 409)

    db.prepare(`
      UPDATE staff
      SET offboarding_started_at=CURRENT_TIMESTAMP,
        exit_date=?, exit_type=?, exit_reason=?, offboarding_owner_user_id=?
      WHERE id=?
    `).run(exitDate, exitType, reason, ownerUserId, normalizedStaffId)
    const checklistId = startChecklist(normalizedStaffId, 'offboarding', actorUserId)
    const after = getStaff(db, normalizedStaffId)
    const event = recordPersonnelEvent({
      staffId: normalizedStaffId,
      eventType: 'offboarding_started',
      effectiveAt: exitDate,
      sourceType: 'staff',
      sourceId: normalizedStaffId,
      before: {
        is_active: staff.is_active,
        offboarding_started_at: staff.offboarding_started_at,
        exit_date: staff.exit_date,
        exit_type: staff.exit_type,
      },
      after: {
        is_active: after.is_active,
        offboarding_started_at: after.offboarding_started_at,
        exit_date: after.exit_date,
        exit_type: after.exit_type,
        owner_user_id: ownerUserId,
        checklist_id: checklistId,
      },
      reason,
      actorUserId,
    })
    return { checklistId, event }
  })

  const result = save()
  notifyManagement(normalizedStaffId, `Cikis sureci baslatildi: ${getStaff(db, normalizedStaffId).full_name}`, 'warning', 'offboarding-start')
  return { ...result, impact: getOffboardingImpact(normalizedStaffId, exitDate) }
}

export function startArchiveCompatibility(staffId, reason, actorUserId) {
  const db = getDB()
  return startOffboarding(staffId, {
    exit_date: todayLocal(db),
    exit_type: 'other',
    reason: String(reason || '').trim() || 'Arsivleme istegi ile kontrollu cikis baslatildi',
    owner_user_id: actorUserId,
  }, actorUserId)
}

function decisionMap(rows, allowed, label) {
  const result = new Map()
  for (const row of rows || []) {
    const id = positiveId(row.id, `${label} kimligi`)
    if (!allowed.has(row.action)) throw fail(`${label} karari gecersiz`)
    const reason = String(row.reason || '').trim()
    if (row.action === 'keep' && !reason) throw fail(`${label} koruma gerekcesi zorunlu`)
    if (result.has(id)) throw fail(`${label} karari birden fazla verildi`)
    result.set(id, { ...row, id, reason })
  }
  return result
}

function requireDecisions(items, decisions, label) {
  const missing = items.filter(item => !decisions.has(Number(item.id))).map(item => item.id)
  if (missing.length) throw fail(`${label} icin karar eksik`, 409, { missing_ids: missing })
}

function recordCancellation(staffId, eventType, sourceType, row, reason, actorUserId) {
  recordPersonnelEvent({
    staffId,
    eventType,
    effectiveAt: row.work_date || row.start_date || row.effective_from,
    sourceType,
    sourceId: row.id,
    before: row,
    after: null,
    reason,
    actorUserId,
    metadata: { offboarding: true, action: 'cancel' },
  })
}

function ensureChecklistComplete(db, checklist) {
  if (!checklist) throw fail('Cikis kontrol listesi bulunamadi', 409)
  if (checklist.status !== 'completed') throw fail('Cikis kontrol listesi tamamlanmadi', 409)
  if (Number(checklist.completed_count) !== Number(checklist.total_count)) {
    throw fail('Cikis kontrol listesindeki tum maddeler tamamlanmali', 409)
  }
}

export function finalizeOffboarding(staffId, data, actorUserId) {
  const db = getDB()
  const normalizedStaffId = positiveId(staffId, 'Personel kimligi')
  const staff = getStaff(db, normalizedStaffId)
  if (!staff.is_active || !staff.offboarding_started_at || !staff.exit_date) {
    throw fail('Personel aktif bir cikis surecinde degil', 409)
  }

  const impact = getOffboardingImpact(normalizedStaffId, staff.exit_date)
  const scheduleDecisions = decisionMap(data.schedules, FUTURE_ACTIONS, 'Vardiya')
  const leaveDecisions = decisionMap(data.leaves, LEAVE_ACTIONS, 'Izin')
  const overtimeDecisions = decisionMap(data.overtime_requests, FUTURE_ACTIONS, 'Mesai talebi')
  requireDecisions(impact.schedules, scheduleDecisions, 'Vardiya kayitlari')
  requireDecisions(impact.leaves, leaveDecisions, 'Izin kayitlari')
  requireDecisions(impact.overtime_requests, overtimeDecisions, 'Mesai talepleri')

  const equipmentException = String(data.equipment_exception_reason || '').trim()
  if (impact.equipment.length && !equipmentException) {
    throw fail('Acik zimmetler iade edilmeli veya istisna aciklamasi girilmeli', 409, { equipment: impact.equipment })
  }
  ensureChecklistComplete(db, impact.checklist)

  const save = db.transaction(() => {
    for (const row of impact.schedules) {
      const decision = scheduleDecisions.get(Number(row.id))
      if (decision.action === 'cancel') {
        db.prepare('DELETE FROM shift_schedule WHERE id=?').run(row.id)
        recordCancellation(normalizedStaffId, 'shift_changed', 'shift_schedule', row,
          decision.reason || 'Isten cikis nedeniyle gelecek vardiya iptal edildi', actorUserId)
      }
    }

    for (const row of impact.leaves) {
      const decision = leaveDecisions.get(Number(row.id))
      if (decision.action === 'cancel') {
        db.prepare('DELETE FROM leave_requests WHERE id=?').run(row.id)
        recordCancellation(normalizedStaffId, 'leave_changed', 'leave_request', row,
          decision.reason || 'Isten cikis nedeniyle izin iptal edildi', actorUserId)
      } else if (decision.action === 'truncate') {
        const newEndDate = isoDate(decision.new_end_date, 'Yeni izin bitis tarihi')
        if (newEndDate > staff.exit_date || newEndDate < row.start_date) {
          throw fail('Yeni izin bitis tarihi izin baslangici ile cikis tarihi arasinda olmali')
        }
        const totalDays = Number(db.prepare(
          'SELECT CAST(julianday(?) - julianday(?) + 1 AS INTEGER) AS value'
        ).get(newEndDate, row.start_date).value)
        db.prepare('UPDATE leave_requests SET end_date=?, total_days=? WHERE id=?')
          .run(newEndDate, totalDays, row.id)
        recordPersonnelEvent({
          staffId: normalizedStaffId,
          eventType: 'leave_changed',
          effectiveAt: row.start_date,
          sourceType: 'leave_request',
          sourceId: row.id,
          before: row,
          after: { ...row, end_date: newEndDate, total_days: totalDays },
          reason: decision.reason || 'Izin cikis tarihine gore kisaltildi',
          actorUserId,
          metadata: { offboarding: true, action: 'truncate' },
        })
      }
    }

    for (const row of impact.overtime_requests) {
      const decision = overtimeDecisions.get(Number(row.id))
      if (decision.action === 'cancel') {
        db.prepare(`
          UPDATE overtime_requests
          SET status='rejected', reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP,
            review_note=?, version=version+1, updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(actorUserId, decision.reason || 'Isten cikis nedeniyle iptal edildi', row.id)
        recordPersonnelEvent({
          staffId: normalizedStaffId,
          eventType: 'overtime_changed',
          effectiveAt: row.work_date,
          sourceType: 'overtime_request',
          sourceId: row.id,
          before: row,
          after: { ...row, status: 'rejected' },
          reason: decision.reason || 'Isten cikis nedeniyle mesai talebi iptal edildi',
          actorUserId,
          metadata: { offboarding: true, action: 'cancel' },
        })
      }
    }

    for (const assignment of impact.future_assignments) {
      db.prepare('DELETE FROM staff_assignments WHERE id=?').run(assignment.id)
      recordCancellation(normalizedStaffId, 'assignment_changed', 'staff_assignment', assignment,
        'Isten cikis nedeniyle gelecek atama iptal edildi', actorUserId)
    }

    db.prepare(`
      UPDATE staff_assignments
      SET effective_to=?
      WHERE staff_id=? AND effective_from<=?
        AND (effective_to IS NULL OR effective_to>?)
    `).run(staff.exit_date, normalizedStaffId, staff.exit_date, staff.exit_date)

    db.prepare(`
      UPDATE staff
      SET is_active=0, archived_at=CURRENT_TIMESTAMP, archive_reason=exit_reason
      WHERE id=?
    `).run(normalizedStaffId)
    const after = getStaff(db, normalizedStaffId)
    const event = recordPersonnelEvent({
      staffId: normalizedStaffId,
      eventType: 'employment_ended',
      effectiveAt: staff.exit_date,
      sourceType: 'staff',
      sourceId: normalizedStaffId,
      before: { is_active: staff.is_active, exit_date: staff.exit_date, exit_type: staff.exit_type },
      after: { is_active: after.is_active, archived_at: after.archived_at, exit_date: after.exit_date, exit_type: after.exit_type },
      reason: staff.exit_reason,
      actorUserId,
      metadata: {
        checklist_id: impact.checklist.id,
        equipment_exception_reason: equipmentException || null,
        kept_schedule_ids: [...scheduleDecisions.values()].filter(row => row.action === 'keep').map(row => row.id),
        kept_leave_ids: [...leaveDecisions.values()].filter(row => row.action === 'keep').map(row => row.id),
        kept_overtime_request_ids: [...overtimeDecisions.values()].filter(row => row.action === 'keep').map(row => row.id),
      },
    })
    return { event }
  })

  const result = save()
  notifyManagement(normalizedStaffId, `Personel cikisi tamamlandi: ${staff.full_name}`, 'warning', 'employment-ended')
  return { ok: true, ...result }
}

export function restoreEmployment(staffId, data, actorUserId) {
  const db = getDB()
  const normalizedStaffId = positiveId(staffId, 'Personel kimligi')
  const effectiveFrom = isoDate(data.effective_from || todayLocal(db), 'Ise donus tarihi')
  const reason = String(data.reason || 'Personel yeniden aktif edildi').trim()
  if (!reason) throw fail('Ise donus aciklamasi zorunlu')

  const save = db.transaction(() => {
    const staff = getStaff(db, normalizedStaffId)
    if (staff.is_active) throw fail('Personel zaten aktif', 409)
    const projectId = data.project_id === undefined ? staff.project_id : (Number(data.project_id) || null)
    const departmentId = data.department_id === undefined ? staff.department_id : (Number(data.department_id) || null)
    const roleId = data.role_id === undefined ? staff.role_id : (Number(data.role_id) || null)
    const workLocationId = data.work_location_id === undefined
      ? db.prepare(`SELECT work_location_id FROM staff_assignments WHERE staff_id=? ORDER BY effective_from DESC, id DESC LIMIT 1`).get(normalizedStaffId)?.work_location_id || null
      : (Number(data.work_location_id) || null)

    db.prepare(`
      UPDATE staff_assignments
      SET effective_to=date(?, '-1 day')
      WHERE staff_id=? AND effective_from<?
        AND (effective_to IS NULL OR effective_to>=?)
    `).run(effectiveFrom, normalizedStaffId, effectiveFrom, effectiveFrom)
    const existing = db.prepare('SELECT id FROM staff_assignments WHERE staff_id=? AND effective_from=?')
      .get(normalizedStaffId, effectiveFrom)
    let assignmentId
    if (existing) {
      db.prepare(`
        UPDATE staff_assignments
        SET project_id=?, department_id=?, role_id=?, work_location_id=?, effective_to=NULL,
          note=?, created_by=?
        WHERE id=?
      `).run(projectId, departmentId, roleId, workLocationId, reason, actorUserId, existing.id)
      assignmentId = existing.id
    } else {
      assignmentId = db.prepare(`
        INSERT INTO staff_assignments(
          staff_id, project_id, department_id, role_id, work_location_id,
          effective_from, note, created_by
        ) VALUES(?,?,?,?,?,?,?,?)
      `).run(normalizedStaffId, projectId, departmentId, roleId, workLocationId,
        effectiveFrom, reason, actorUserId).lastInsertRowid
    }

    db.prepare(`
      UPDATE staff
      SET is_active=1, archived_at=NULL, archive_reason=NULL,
        offboarding_started_at=NULL, exit_date=NULL, exit_type=NULL, exit_reason=NULL,
        offboarding_owner_user_id=NULL, project_id=?, department_id=?, role_id=?
      WHERE id=?
    `).run(projectId, departmentId, roleId, normalizedStaffId)
    const checklistId = startChecklist(normalizedStaffId, 'onboarding', actorUserId)
    const after = getStaff(db, normalizedStaffId)
    const event = recordPersonnelEvent({
      staffId: normalizedStaffId,
      eventType: 'employment_restored',
      effectiveAt: effectiveFrom,
      sourceType: 'staff',
      sourceId: normalizedStaffId,
      before: {
        is_active: staff.is_active,
        archived_at: staff.archived_at,
        exit_date: staff.exit_date,
        exit_type: staff.exit_type,
      },
      after: {
        is_active: after.is_active,
        project_id: after.project_id,
        department_id: after.department_id,
        role_id: after.role_id,
        assignment_id: assignmentId,
        checklist_id: checklistId,
      },
      reason,
      actorUserId,
    })
    return { assignment_id: assignmentId, checklist_id: checklistId, event }
  })

  const result = save()
  notifyManagement(normalizedStaffId, `Personel yeniden aktif edildi: ${getStaff(db, normalizedStaffId).full_name}`, 'info', 'employment-restored')
  return { ok: true, ...result }
}
