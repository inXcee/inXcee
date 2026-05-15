import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'

export const expensesRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

const VALID_CATEGORIES = ['food', 'cleaning', 'laundry', 'maintenance', 'utilities', 'staff', 'other']

expensesRouter.get('/', requireAuth, (req, res) => {
  const db = getDB()
  const where = []
  const params = []
  if (req.query.category) { where.push('e.category=?'); params.push(req.query.category) }
  if (req.query.from) { where.push('e.expense_date >= ?'); params.push(req.query.from) }
  if (req.query.to) { where.push('e.expense_date <= ?'); params.push(req.query.to) }
  if (req.query.company_id) { where.push('e.company_id=?'); params.push(+req.query.company_id) }
  const sql = `
    SELECT e.*, c.name AS company_name, u.full_name AS created_by_name
    FROM expenses e
    LEFT JOIN companies c ON c.id=e.company_id
    LEFT JOIN users u ON u.id=e.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.expense_date DESC, e.id DESC LIMIT 1000
  `
  res.json(db.prepare(sql).all(...params))
})

expensesRouter.get('/summary', requireAuth, (req, res) => {
  const db = getDB()
  const months = Math.min(Math.max(+req.query.months || 6, 1), 24)
  // Aylik toplam
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', expense_date) AS month,
      ROUND(SUM(amount), 2) AS total,
      COUNT(*) AS count
    FROM expenses
    WHERE expense_date >= date('now', '-' || ? || ' months')
    GROUP BY month ORDER BY month
  `).all(months)
  // Kategori dagilimi (bu ay)
  const byCategory = db.prepare(`
    SELECT category, ROUND(SUM(amount), 2) AS total, COUNT(*) AS count
    FROM expenses
    WHERE strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now')
    GROUP BY category ORDER BY total DESC
  `).all()
  // Sakin basina maliyet (bu ay)
  const thisMonth = db.prepare(`
    SELECT ROUND(SUM(amount), 2) AS total FROM expenses
    WHERE strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now')
  `).get()
  const activeResidents = db.prepare(`
    SELECT COUNT(*) AS c FROM personnel WHERE check_out_date IS NULL
  `).get().c
  const perResident = activeResidents > 0 ? (thisMonth.total || 0) / activeResidents : 0
  res.json({
    monthly,
    by_category: byCategory,
    this_month_total: thisMonth.total || 0,
    active_residents: activeResidents,
    per_resident: Math.round(perResident * 100) / 100,
  })
})

expensesRouter.post('/', ...mgmt, (req, res) => {
  const b = req.body || {}
  if (!VALID_CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'Geçersiz kategori' })
  if (!b.description || b.description.trim().length < 2) return res.status(400).json({ error: 'Açıklama gerekli' })
  if (b.amount == null || isNaN(+b.amount) || +b.amount < 0) return res.status(400).json({ error: 'Geçersiz tutar' })
  if (!b.expense_date) return res.status(400).json({ error: 'Tarih gerekli' })
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO expenses (category, description, amount, expense_date, invoice_no, company_id, document_id, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    b.category, b.description.trim(), +b.amount, b.expense_date,
    b.invoice_no || null, b.company_id || null, b.document_id || null,
    b.notes || null, req.user.id
  )
  logAudit(req.user.id, 'expense_create', 'expenses', r.lastInsertRowid, `${b.category} ${b.amount}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

expensesRouter.delete('/:id', ...mgmt, (req, res) => {
  const db = getDB()
  const r = db.prepare('DELETE FROM expenses WHERE id=?').run(+req.params.id)
  if (r.changes === 0) return res.status(404).json({ error: 'Bulunamadı' })
  logAudit(req.user.id, 'expense_delete', 'expenses', +req.params.id, null)
  res.json({ ok: true })
})
