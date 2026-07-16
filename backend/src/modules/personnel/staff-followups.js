import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logger } from '../../shared/logger.js'

export const FOLLOWUP_CATEGORIES = [
  'general', 'document', 'attendance', 'performance', 'safety',
  'equipment', 'onboarding', 'offboarding', 'transport', 'dormitory',
]
export const FOLLOWUP_PRIORITIES = ['low', 'medium', 'high', 'critical']
const CATEGORY_SET = new Set(FOLLOWUP_CATEGORIES)
const PRIORITY_SET = new Set(FOLLOWUP_PRIORITIES)

function fail(message, statusCode = 400) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function requireStaff(db, staffId) {
  const staff = db.prepare('SELECT id, full_name FROM staff WHERE id=?').get(staffId)
  if (!staff) throw fail('Personel bulunamadı', 404)
  return staff
}

function shape(row) {
  const overdue = row.status === 'open' && row.due_at && row.due_at < new Date().toISOString()
  return { ...row, is_overdue: !!overdue }
}

export function listFollowups(staffId, { status } = {}) {
  const db = getDB()
  requireStaff(db, staffId)
  const where = ['f.staff_id=?']
  const params = [staffId]
  if (status && ['open', 'done', 'cancelled'].includes(status)) { where.push('f.status=?'); params.push(status) }
  const rows = db.prepare(`
    SELECT f.id, f.staff_id, f.title, f.description, f.category, f.priority,
      f.assigned_user_id, f.due_at, f.status, f.completed_at, f.created_at, f.updated_at,
      au.full_name AS assigned_user_name,
      cu.full_name AS created_by_name,
      du.full_name AS completed_by_name
    FROM staff_followups f
    LEFT JOIN users au ON au.id=f.assigned_user_id
    LEFT JOIN users cu ON cu.id=f.created_by
    LEFT JOIN users du ON du.id=f.completed_by
    WHERE ${where.join(' AND ')}
    ORDER BY (f.status='open') DESC, f.due_at IS NULL, f.due_at, f.created_at DESC
  `).all(...params)
  const shaped = rows.map(shape)
  return {
    followups: shaped,
    summary: {
      open: shaped.filter(f => f.status === 'open').length,
      overdue: shaped.filter(f => f.is_overdue).length,
      done: shaped.filter(f => f.status === 'done').length,
    },
    categories: FOLLOWUP_CATEGORIES,
    priorities: FOLLOWUP_PRIORITIES,
  }
}

function normalizeDue(value) {
  if (!value) return null
  const raw = String(value).trim()
  // YYYY-MM-DD → günün sonuna kadar; tam datetime da kabul edilir.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59:59`
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) throw fail('Geçersiz son tarih')
  return raw
}

function notifyAssignee(followup, actorId, verb) {
  if (!followup.assigned_user_id || followup.assigned_user_id === actorId) return
  try {
    createNotification({
      message: `Personel görevi ${verb}: ${followup.title}`,
      severity: followup.priority === 'critical' || followup.priority === 'high' ? 'warning' : 'info',
      module: 'personnel',
      target_user_id: followup.assigned_user_id,
      entity_type: 'staff_followup',
      entity_id: followup.id,
      link: `/shifts/personnel/${followup.staff_id}?tab=notes`,
      dedup_key: `staff-followup:${followup.id}:${verb}`,
    })
  } catch (e) {
    logger.warn('[staff-followup] bildirim gönderilemedi:', e.message)
  }
}

export function createFollowup(staffId, data, { userId } = {}) {
  const db = getDB()
  requireStaff(db, staffId)
  const title = String(data.title || '').trim()
  if (!title) throw fail('Görev başlığı gerekli')
  const category = CATEGORY_SET.has(data.category) ? data.category : 'general'
  const priority = PRIORITY_SET.has(data.priority) ? data.priority : 'medium'
  const dueAt = normalizeDue(data.due_at)
  let assignedUserId = null
  if (data.assigned_user_id) {
    assignedUserId = +data.assigned_user_id
    const exists = db.prepare('SELECT id FROM users WHERE id=?').get(assignedUserId)
    if (!exists) throw fail('Atanan kullanıcı bulunamadı')
  }
  const result = db.prepare(`
    INSERT INTO staff_followups(
      staff_id, title, description, category, priority, assigned_user_id, due_at,
      status, created_by, updated_by
    ) VALUES(?,?,?,?,?,?,?,'open',?,?)
  `).run(
    staffId, title, data.description ? String(data.description).slice(0, 2000) : null,
    category, priority, assignedUserId, dueAt, userId ?? null, userId ?? null,
  )
  const id = result.lastInsertRowid
  notifyAssignee({ id, staff_id: staffId, title, priority, assigned_user_id: assignedUserId }, userId, 'atandı')
  return { id }
}

function getFollowup(db, followupId) {
  const row = db.prepare('SELECT * FROM staff_followups WHERE id=?').get(followupId)
  if (!row) throw fail('Görev bulunamadı', 404)
  return row
}

export function updateFollowup(followupId, data, { userId } = {}) {
  const db = getDB()
  const followup = getFollowup(db, followupId)
  const fields = []
  const params = []
  const set = (column, value) => { fields.push(`${column}=?`); params.push(value) }
  if (data.title != null) {
    const title = String(data.title).trim()
    if (!title) throw fail('Görev başlığı boş olamaz')
    set('title', title.slice(0, 300))
  }
  if (data.description != null) set('description', data.description ? String(data.description).slice(0, 2000) : null)
  if (data.category != null) {
    if (!CATEGORY_SET.has(data.category)) throw fail('Geçersiz kategori')
    set('category', data.category)
  }
  if (data.priority != null) {
    if (!PRIORITY_SET.has(data.priority)) throw fail('Geçersiz öncelik')
    set('priority', data.priority)
  }
  if (data.due_at !== undefined) set('due_at', normalizeDue(data.due_at))
  let newAssignee
  if (data.assigned_user_id !== undefined) {
    newAssignee = data.assigned_user_id ? +data.assigned_user_id : null
    if (newAssignee && !db.prepare('SELECT id FROM users WHERE id=?').get(newAssignee)) {
      throw fail('Atanan kullanıcı bulunamadı')
    }
    set('assigned_user_id', newAssignee)
  }
  if (!fields.length) return { ok: true, unchanged: true }
  set('updated_by', userId ?? null)
  params.push(followupId)
  db.prepare(`UPDATE staff_followups SET ${fields.join(', ')} WHERE id=?`).run(...params)
  // Yeni bir kişiye atandıysa bildir.
  if (newAssignee && newAssignee !== followup.assigned_user_id) {
    notifyAssignee({ ...followup, id: followupId, assigned_user_id: newAssignee }, userId, 'yeniden atandı')
  }
  return { ok: true }
}

export function completeFollowup(followupId, { userId } = {}) {
  const db = getDB()
  const followup = getFollowup(db, followupId)
  if (followup.status !== 'open') throw fail('Yalnız açık görev tamamlanabilir')
  db.prepare(`
    UPDATE staff_followups
    SET status='done', completed_by=?, completed_at=CURRENT_TIMESTAMP, updated_by=?
    WHERE id=?
  `).run(userId ?? null, userId ?? null, followupId)
  return { ok: true }
}

export function cancelFollowup(followupId, { userId } = {}) {
  const db = getDB()
  const followup = getFollowup(db, followupId)
  if (followup.status !== 'open') throw fail('Yalnız açık görev iptal edilebilir')
  db.prepare("UPDATE staff_followups SET status='cancelled', updated_by=? WHERE id=?")
    .run(userId ?? null, followupId)
  return { ok: true }
}
