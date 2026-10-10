import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'

// Öğün başı sayım (migration 116) — kişi başı meal_logs'tan bağımsız toplam sayı.
export const COUNT_MEALS = ['breakfast', 'lunch', 'dinner', 'night', 'snack']

export function listMealCounts({ from, to }) {
  const rows = getDB().prepare(`
    SELECT id, meal_date, meal_type, location, count, note, source, updated_at
    FROM meal_counts WHERE meal_date BETWEEN ? AND ? ORDER BY meal_date, meal_type, location
  `).all(from, to)
  const byDay = {}
  for (const r of rows) byDay[r.meal_date] = (byDay[r.meal_date] || 0) + r.count
  return { from, to, rows, by_day: byDay, total: rows.reduce((s, r) => s + r.count, 0) }
}

// Aynı (gün, öğün, yer) için tekrar yazmak sayıyı DÜZELTİR (toplamaz); önceki değer döner ki
// Telegram "geri al" eski sayıyı geri yazabilsin.
export function setMealCount({ meal_date, meal_type, location = '', count, note = null, source = 'web' }, userId) {
  const db = getDB()
  const loc = (location || '').trim()
  return db.transaction(() => {
    const prev = db.prepare('SELECT id, count, note FROM meal_counts WHERE meal_date=? AND meal_type=? AND location=?')
      .get(meal_date, meal_type, loc)
    db.prepare(`
      INSERT INTO meal_counts(meal_date, meal_type, location, count, note, source, updated_by) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(meal_date, meal_type, location) DO UPDATE SET
        count=excluded.count, note=excluded.note, source=excluded.source,
        updated_by=excluded.updated_by, updated_at=datetime('now')
    `).run(meal_date, meal_type, loc, count, note, source, userId)
    const row = db.prepare('SELECT * FROM meal_counts WHERE meal_date=? AND meal_type=? AND location=?').get(meal_date, meal_type, loc)
    logAudit(userId, 'meal_count_set', 'meals', row.id,
      `${meal_date} ${meal_type}${loc ? ` ${loc}` : ''}: ${prev ? `${prev.count} → ` : ''}${count}`)
    return { ...row, previous: prev ? prev.count : null }
  })()
}

export function deleteMealCount(id, userId) {
  const db = getDB()
  const row = db.prepare('SELECT * FROM meal_counts WHERE id=?').get(id)
  if (!row) throw Object.assign(new Error('Kayıt bulunamadı'), { statusCode: 404 })
  db.prepare('DELETE FROM meal_counts WHERE id=?').run(id)
  logAudit(userId, 'meal_count_delete', 'meals', id, `${row.meal_date} ${row.meal_type}: ${row.count}`)
  return { ok: true, deleted: row }
}
