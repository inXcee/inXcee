import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'

export const integrityRouter = Router()
const mgr = requireRole('campus_manager')
const view = requireRole('campus_manager', 'shift_supervisor')

// ── S1: Tutarsızlık taraması ──
integrityRouter.get('/scan', ...view, (req, res) => {
  try {
    const db = getDB()
    const issues = []

    // 1) Çıkmış personelin (is_active=0) hala oda atamasi var
    const archivedWithRoom = db.prepare(`
      SELECT s.id, s.full_name, r.block, r.room_no
      FROM staff s
      LEFT JOIN personnel p ON p.tc_no IS NOT NULL AND p.tc_no = s.tc_no
      JOIN room_assignments ra ON ra.personnel_id = p.id AND ra.check_out_at IS NULL
      JOIN rooms r ON r.id = ra.room_id
      WHERE s.is_active = 0
    `).all()
    archivedWithRoom.forEach(r => issues.push({
      severity: 'warning', kind: 'archived_has_room',
      staff_id: r.id, full_name: r.full_name,
      detail: `Arşivde ama ${r.block}-${r.room_no} odasında aktif`,
    }))

    // 2) Çıkmış personelin (is_active=0) hala vardiya kaydı bugünden sonra var
    const archivedFutureShift = db.prepare(`
      SELECT s.id, s.full_name, COUNT(*) as future_count
      FROM staff s
      JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date >= date('now')
      WHERE s.is_active = 0
      GROUP BY s.id
    `).all()
    archivedFutureShift.forEach(r => issues.push({
      severity: 'warning', kind: 'archived_has_future_shift',
      staff_id: r.id, full_name: r.full_name,
      detail: `Arşivde ama ${r.future_count} gelecek vardiya kaydı var`,
    }))

    // 3) Oda kapasite aşımı
    const overCapacity = db.prepare(`
      SELECT r.id, r.block, r.room_no, r.capacity,
        (SELECT COUNT(*) FROM room_assignments WHERE room_id = r.id AND check_out_at IS NULL) as occupied
      FROM rooms r
      WHERE (SELECT COUNT(*) FROM room_assignments WHERE room_id = r.id AND check_out_at IS NULL) > r.capacity
    `).all()
    overCapacity.forEach(r => issues.push({
      severity: 'critical', kind: 'room_overcapacity',
      detail: `${r.block}-${r.room_no}: ${r.occupied}/${r.capacity} kapasite aşımı`,
    }))

    // 4) Duplicate TC (staff veya personnel'de aynı TC çift kayıt)
    const dupStaffTc = db.prepare(`
      SELECT tc_no, COUNT(*) as c FROM staff WHERE tc_no IS NOT NULL AND tc_no != '' GROUP BY tc_no HAVING c > 1
    `).all()
    dupStaffTc.forEach(r => issues.push({
      severity: 'critical', kind: 'duplicate_tc_staff',
      detail: `staff tablosunda TC=${r.tc_no} ${r.c} kez var`,
    }))

    const dupPersTc = db.prepare(`
      SELECT tc_no, COUNT(*) as c FROM personnel WHERE tc_no IS NOT NULL AND tc_no != '' GROUP BY tc_no HAVING c > 1
    `).all()
    dupPersTc.forEach(r => issues.push({
      severity: 'critical', kind: 'duplicate_tc_personnel',
      detail: `personnel tablosunda TC=${r.tc_no} ${r.c} kez var`,
    }))

    // 5) Aktif personel ama hiç vardiyası yok (son 60g)
    const noShifts = db.prepare(`
      SELECT s.id, s.full_name FROM staff s
      WHERE s.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM shift_schedule WHERE staff_id = s.id AND work_date >= date('now','-60 days'))
      LIMIT 100
    `).all()
    noShifts.forEach(r => issues.push({
      severity: 'info', kind: 'no_recent_shift',
      staff_id: r.id, full_name: r.full_name,
      detail: 'Son 60 gündür vardiya kaydı yok',
    }))

    // 6) Sertifika süresi geçmiş ama hala aktif
    const expiredCerts = db.prepare(`
      SELECT s.id, s.full_name, t.title, a.cert_expires_at
      FROM training_attendances a
      JOIN training_sessions t ON t.id = a.session_id
      JOIN staff s ON s.id = a.staff_id
      WHERE a.cert_expires_at IS NOT NULL
        AND a.cert_expires_at < date('now')
        AND a.attended = 1
        AND s.is_active = 1
    `).all()
    expiredCerts.forEach(r => issues.push({
      severity: 'warning', kind: 'expired_cert',
      staff_id: r.id, full_name: r.full_name,
      detail: `${r.title} sertifikası süresi geçti (${r.cert_expires_at})`,
    }))

    // 7) KKD zimmeti üzerinden 1 yıldan eski ama iade edilmemiş
    const oldKkd = db.prepare(`
      SELECT s.id, s.full_name, k.item_type, k.assigned_at
      FROM kkd_assignments k JOIN staff s ON s.id = k.staff_id
      WHERE k.returned_at IS NULL AND k.assigned_at < date('now','-365 days')
    `).all()
    oldKkd.forEach(r => issues.push({
      severity: 'info', kind: 'old_kkd',
      staff_id: r.id, full_name: r.full_name,
      detail: `${r.item_type} 1 yıldan eski (${r.assigned_at?.slice(0, 10)}) iade alınmadı`,
    }))

    const counts = {
      critical: issues.filter(i => i.severity === 'critical').length,
      warning: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
    }
    res.json({ scanned_at: new Date().toISOString(), counts, issues })
  } catch (e) { console.error('[integrity/scan]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── S2: KVKK V2 — veri silme talepleri ──
integrityRouter.get('/kvkk', ...mgr, (req, res) => {
  try {
    const db = getDB()
    let q = `SELECT * FROM kvkk_requests WHERE 1=1`
    const params = []
    if (req.query.status) { q += ' AND status = ?'; params.push(req.query.status) }
    q += ' ORDER BY created_at DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { console.error('[kvkk/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

integrityRouter.post('/kvkk', ...mgr, (req, res) => {
  try {
    const { kind, target_type, target_id, requester_name, requester_contact, details } = req.body || {}
    if (!kind || !target_type || !target_id || !requester_name) {
      return res.status(400).json({ error: 'kind, target_type, target_id, requester_name gerekli' })
    }
    if (!['access', 'rectify', 'erase', 'restrict', 'portability'].includes(kind)) {
      return res.status(400).json({ error: 'Geçersiz kind' })
    }
    const id = getDB().prepare(`
      INSERT INTO kvkk_requests(kind, target_type, target_id, requester_name, requester_contact, details)
      VALUES(?,?,?,?,?,?)
    `).run(kind, target_type, +target_id, requester_name, requester_contact || null, details || null).lastInsertRowid
    logAudit(req.user.id, 'kvkk_create', 'integrity', id, `${kind} ${target_type}:${target_id}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

integrityRouter.post('/kvkk/:id/decide', ...mgr, (req, res) => {
  try {
    const { decision, notes, executes_in_days = 7 } = req.body || {}
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision: approved|rejected' })
    }
    // Grace period 0-365 gün arası — negatif değerle bypass'i önle
    const days = Math.max(0, Math.min(365, parseInt(executes_in_days, 10) || 7))
    const db = getDB()
    const executesAt = decision === 'approved'
      ? new Date(Date.now() + days * 86400000).toISOString()
      : null
    db.prepare(`
      UPDATE kvkk_requests
      SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ?, decision_notes = ?, executes_at = ?
      WHERE id = ?
    `).run(decision, req.user.id, notes || null, executesAt, +req.params.id)
    logAudit(req.user.id, 'kvkk_decide', 'integrity', +req.params.id, decision)
    res.json({ ok: true, executes_at: executesAt })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

integrityRouter.post('/kvkk/:id/execute', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const r = db.prepare('SELECT * FROM kvkk_requests WHERE id=?').get(+req.params.id)
    if (!r) return res.status(404).json({ error: 'Bulunamadı' })
    if (r.status !== 'approved') return res.status(400).json({ error: 'Sadece onaylanmış talepler uygulanır' })

    // Sadece 'erase' için anonimleştir
    if (r.kind === 'erase' && r.target_type === 'staff') {
      db.prepare(`
        UPDATE staff SET tc_no = NULL, phone = NULL, email = NULL, address = NULL,
          emergency_contact = NULL, emergency_phone = NULL, notes = '[KVKK silindi]',
          birth_date = NULL, full_name = 'KVKK-' || id, is_active = 0,
          archived_at = CURRENT_TIMESTAMP, archive_reason = 'KVKK veri silme talebi #' || ?
        WHERE id = ?
      `).run(r.id, r.target_id)
    } else if (r.kind === 'erase' && r.target_type === 'personnel') {
      db.prepare(`
        UPDATE personnel SET tc_no = NULL, passport_no = NULL, phone_number = NULL,
          full_name = 'KVKK-' || id
        WHERE id = ?
      `).run(r.target_id)
    }

    db.prepare(`UPDATE kvkk_requests SET status = 'completed' WHERE id = ?`).run(+req.params.id)
    logAudit(req.user.id, 'kvkk_execute', 'integrity', +req.params.id, `${r.kind} on ${r.target_type}:${r.target_id}`)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── S3: Audit dashboard zenginleştirme ──
integrityRouter.get('/audit-summary', ...view, (req, res) => {
  try {
    const db = getDB()
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30))

    const byAction = db.prepare(`
      SELECT action, COUNT(*) as count
      FROM audit_log
      WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY action
      ORDER BY count DESC
      LIMIT 30
    `).all(days)

    const byUser = db.prepare(`
      SELECT u.username, u.full_name, COUNT(a.id) as count
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.created_at >= date('now', '-' || ? || ' days')
      GROUP BY a.user_id
      ORDER BY count DESC
      LIMIT 20
    `).all(days)

    const dailyTrend = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM audit_log
      WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date
    `).all(days)

    res.json({ days, by_action: byAction, by_user: byUser, daily_trend: dailyTrend })
  } catch (e) { console.error('[audit-summary]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── S4: Backup restore test ──
integrityRouter.get('/backup-status', ...view, (req, res) => {
  try {
    const db = getDB()
    // backup_log tablosu var mı?
    const exists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='backup_log'`
    ).get()
    if (!exists) return res.json({ message: 'backup_log tablosu yok', backups: [] })

    const recent = db.prepare(`
      SELECT * FROM backup_log ORDER BY created_at DESC LIMIT 10
    `).all()
    res.json({ backups: recent })
  } catch (e) { console.error('[backup-status]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
