import { getDB } from '../../shared/db/index.js'

const ONBOARDING_DEFAULTS = [
  'İş sözleşmesi imzalandı',
  'Kimlik fotokopisi alındı',
  'Sağlık raporu teslim edildi',
  'Banka hesabı bilgileri alındı',
  'Acil iletişim kişisi kaydedildi',
  'İş güvenliği eğitimi tamamlandı',
  'KKD (baret, gözlük, eldiven, ayakkabı) teslim edildi',
  'Yatakhane oda ataması yapıldı',
  'Servis (durak/rota) atandı',
  'Kart/PIN verildi',
  'Yangın güvenliği oryantasyonu',
  'Departman müdürüne tanıtıldı',
]

const OFFBOARDING_DEFAULTS = [
  'İstifa/fesih bildirimi alındı',
  'KKD iade edildi (baret, gözlük, eldiven, ayakkabı)',
  'Yatakhane oda boşaltıldı + temizlik kontrolü',
  'Çamaşır torbaları iade alındı',
  'Servis ataması iptal edildi',
  'Kart/PIN iptal edildi',
  'Son maaş hesaplandı (mesai + izin + kesintiler)',
  'SGK çıkış işlemi yapıldı',
  'İbra belgesi imzalandı',
  'Şirket eşyaları (telefon, laptop vb.) iade alındı',
  'KVKK aydınlatma formu / silme talebi alındı',
]

export function startChecklist(staffId, kind, userId) {
  const db = getDB()
  // Aynı kind'da open varsa onu döndür
  const existing = db.prepare(
    `SELECT id FROM hr_checklists WHERE staff_id=? AND kind=? AND status='open' LIMIT 1`
  ).get(staffId, kind)
  if (existing) return existing.id

  const id = db.prepare(`
    INSERT INTO hr_checklists(staff_id, kind, status, completed_by)
    VALUES(?,?,'open',?)
  `).run(staffId, kind, userId || null).lastInsertRowid

  const items = kind === 'onboarding' ? ONBOARDING_DEFAULTS : OFFBOARDING_DEFAULTS
  const itemInsert = db.prepare(
    `INSERT INTO hr_checklist_items(checklist_id, label, sort_order) VALUES(?,?,?)`
  )
  const tx = db.transaction(() => items.forEach((label, i) => itemInsert.run(id, label, i)))
  tx()
  return id
}

export function getChecklist(checklistId) {
  const db = getDB()
  const head = db.prepare(`
    SELECT c.*, s.full_name as staff_name, s.tc_no, s.phone, s.email,
      d.name as dept_name
    FROM hr_checklists c
    JOIN staff s ON s.id = c.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE c.id = ?
  `).get(checklistId)
  if (!head) return null
  const items = db.prepare(`
    SELECT * FROM hr_checklist_items WHERE checklist_id = ? ORDER BY sort_order, id
  `).all(checklistId)
  const completed = items.filter(i => i.done).length
  return { ...head, items, completed_count: completed, total_count: items.length }
}

export function listChecklists({ kind, status, staffId, limit = 50 } = {}) {
  const db = getDB()
  let q = `
    SELECT c.id, c.staff_id, c.kind, c.status, c.started_at, c.completed_at,
      s.full_name as staff_name, s.phone,
      d.name as dept_name,
      (SELECT COUNT(*) FROM hr_checklist_items WHERE checklist_id=c.id) as total_count,
      (SELECT COUNT(*) FROM hr_checklist_items WHERE checklist_id=c.id AND done=1) as completed_count
    FROM hr_checklists c
    JOIN staff s ON s.id = c.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE 1=1
  `
  const params = []
  if (kind) { q += ' AND c.kind = ?'; params.push(kind) }
  if (status) { q += ' AND c.status = ?'; params.push(status) }
  if (staffId) { q += ' AND c.staff_id = ?'; params.push(staffId) }
  q += ' ORDER BY c.started_at DESC LIMIT ?'
  params.push(limit)
  return db.prepare(q).all(...params)
}

export function toggleItem(itemId, done, userId, note) {
  const db = getDB()
  db.prepare(`
    UPDATE hr_checklist_items
    SET done = ?, done_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
      done_by = CASE WHEN ? = 1 THEN ? ELSE NULL END,
      note = COALESCE(?, note)
    WHERE id = ?
  `).run(done ? 1 : 0, done ? 1 : 0, done ? 1 : 0, userId || null, note ?? null, itemId)
}

export function addItem(checklistId, label) {
  const db = getDB()
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM hr_checklist_items WHERE checklist_id=?'
  ).get(checklistId).m
  return db.prepare(`
    INSERT INTO hr_checklist_items(checklist_id, label, sort_order) VALUES(?,?,?)
  `).run(checklistId, label, maxOrder + 1).lastInsertRowid
}

export function deleteItem(itemId) {
  getDB().prepare('DELETE FROM hr_checklist_items WHERE id = ?').run(itemId)
}

export function completeChecklist(checklistId, userId, ibraPdfPath) {
  getDB().prepare(`
    UPDATE hr_checklists
    SET status='completed', completed_at=CURRENT_TIMESTAMP, completed_by=?, ibra_pdf_path=?
    WHERE id=?
  `).run(userId || null, ibraPdfPath || null, checklistId)
}

export function cancelChecklist(checklistId) {
  getDB().prepare(`UPDATE hr_checklists SET status='cancelled' WHERE id=?`).run(checklistId)
}

// HR3 — Sözleşme yenileme uyarısı (staff.contract_end <= today + N days)
export function getExpiringContracts({ days = 30 } = {}) {
  const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
  return getDB().prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.phone, s.contract_end,
      d.name as dept_name, d.color_class as dept_color
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1
      AND s.contract_end IS NOT NULL
      AND s.contract_end <= ?
    ORDER BY s.contract_end
  `).all(cutoff)
}
