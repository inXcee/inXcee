// Tarihli izin açılış bakiyeleri — İK Excel'i gibi dış kaynaklardan gelen kalan günler.
// Girişler 'pending' doğar; campus_manager kişi kişi onaylar/reddeder. "Yıllık hak" alanına
// (leave_balance.annual_total) hiçbir şey yazılmaz.
import { getDB } from '../../shared/db/index.js'
import { isIsoDate } from '../../shared/validation/date.js'
import { buildStaffResolver } from '../personnel/staffAliases.js'
import { computeAnnualBalance } from './leaveBalance.js'

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode })

// Ortak çözümleyici (TC → birebir ad → kayıtlı eşleştirme → aksansız ad); yalnız aktif personel.
function staffResolver(db) {
  const resolve = buildStaffResolver(db)
  return (row) => {
    if (row.staff_id) {
      const s = resolve.byId.get(Number(row.staff_id))
      return s ? { staff: s } : { error: `#${row.staff_id} aktif personel değil` }
    }
    const r = resolve(row.name || '', row.tc)
    if (r.method === 'ambiguous') return { error: `"${row.name}" birden çok kişiyle eşleşiyor` }
    if (!r.staff) return { error: `"${row.name}" aktif personelde bulunamadı` }
    return { staff: r.staff, fuzzy: r.method === 'fold' }
  }
}

// rows: [{ staff_id? | name?, days, as_of_date?, note? }]. Hatalı satır varsa hiçbiri yazılmaz.
export function createOpeningBalances({ rows = [], as_of_date, source = 'manual', source_label = null, dryRun = false }, userId) {
  const db = getDB()
  if (!Array.isArray(rows) || rows.length === 0) throw httpError('En az bir satır gerekli', 400)
  if (rows.length > 1000) throw httpError('En fazla 1000 satır', 400)
  const resolve = staffResolver(db)
  const seen = new Set()
  const accepted = [], errors = []
  rows.forEach((row, i) => {
    const date = row.as_of_date || as_of_date
    const days = Number(row.days)
    const r = resolve(row)
    const label = row.name || `#${row.staff_id}`
    if (r.error) return errors.push({ line: i + 1, name: label, error: r.error })
    if (!isIsoDate(date)) return errors.push({ line: i + 1, name: label, error: 'Tarih YYYY-MM-DD olmalı' })
    if (!Number.isFinite(days) || days < -60 || days > 400) return errors.push({ line: i + 1, name: label, error: 'Gün sayısı geçersiz' })
    if (seen.has(r.staff.id)) return errors.push({ line: i + 1, name: label, error: 'Aynı kişi listede iki kez' })
    seen.add(r.staff.id)
    accepted.push({
      staff_id: r.staff.id, full_name: r.staff.full_name, input_name: row.name || null, fuzzy: !!r.fuzzy,
      as_of_date: date, days, note: String(row.note || '').trim() || null,
      current: computeAnnualBalance(r.staff.id),
    })
  })
  if (errors.length || dryRun) return { ok: errors.length === 0, dryRun: !!dryRun, rows: accepted, errors }

  const ins = db.prepare(`INSERT INTO leave_opening_balances(staff_id, as_of_date, days, source, source_label, note, created_by)
    VALUES(?,?,?,?,?,?,?)`)
  const ids = db.transaction(() => accepted.map(a =>
    ins.run(a.staff_id, a.as_of_date, a.days, source, source_label, a.note, userId || null).lastInsertRowid))()
  return { ok: true, dryRun: false, ids, rows: accepted, errors: [] }
}

export function listOpeningBalances({ status } = {}) {
  const db = getDB()
  const where = status ? 'WHERE ob.status=?' : ''
  const rows = db.prepare(`
    SELECT ob.*, s.full_name, d.name AS dept_name, s.hire_date,
      cu.full_name AS created_by_name, du.full_name AS decided_by_name
    FROM leave_opening_balances ob
    JOIN staff s ON s.id = ob.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN users cu ON cu.id = ob.created_by
    LEFT JOIN users du ON du.id = ob.decided_by
    ${where}
    ORDER BY CASE ob.status WHEN 'pending' THEN 0 ELSE 1 END, s.full_name, ob.id DESC
    LIMIT 2000
  `).all(...(status ? [status] : []))
  // Bekleyenlerde "onaylanırsa kalan" önizlemesi — kararı veren farkı görsün.
  return rows.map(r => {
    const current = computeAnnualBalance(r.staff_id)
    return { ...r, current_basis: current?.basis, current_remaining: current?.remaining ?? null }
  })
}

export function decideOpeningBalance(id, { decision, note }, userId) {
  const db = getDB()
  if (!['approve', 'reject'].includes(decision)) throw httpError('Karar approve ya da reject olmalı', 400)
  const row = db.prepare('SELECT * FROM leave_opening_balances WHERE id=?').get(id)
  if (!row) throw httpError('Kayıt bulunamadı', 404)
  if (row.status !== 'pending') throw httpError('Bu kayıt için karar zaten verilmiş', 409)
  db.prepare(`UPDATE leave_opening_balances
    SET status=?, decided_by=?, decided_at=datetime('now'), decision_note=? WHERE id=?`)
    .run(decision === 'approve' ? 'approved' : 'rejected', userId || null, String(note || '').trim() || null, id)
  return { ...db.prepare('SELECT * FROM leave_opening_balances WHERE id=?').get(id), balance: computeAnnualBalance(row.staff_id) }
}
