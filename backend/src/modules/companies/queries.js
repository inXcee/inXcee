import { getDB } from '../../shared/db/index.js'

export function listCompanies({ activeOnly } = {}) {
  const db = getDB()
  const where = activeOnly ? 'WHERE c.is_active=1' : ''
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM personnel p WHERE (p.company_id=c.id OR p.company=c.name) AND p.check_out_date IS NULL) AS active_personnel
    FROM companies c
    ${where}
    ORDER BY c.is_active DESC, c.name
  `).all()
}

export function getCompany(id) {
  const db = getDB()
  return db.prepare('SELECT * FROM companies WHERE id=?').get(id)
}

export function createCompany(data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO companies (name, contact_name, contact_phone, contact_email, tax_no,
      contract_start, contract_end, bed_quota, price_per_bed, notes, is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    data.name, data.contact_name || null, data.contact_phone || null, data.contact_email || null,
    data.tax_no || null, data.contract_start || null, data.contract_end || null,
    data.bed_quota ?? null, data.price_per_bed ?? null, data.notes || null,
    data.is_active === false ? 0 : 1
  )
  return r.lastInsertRowid
}

export function updateCompany(id, data) {
  const db = getDB()
  db.prepare(`
    UPDATE companies SET
      name=?, contact_name=?, contact_phone=?, contact_email=?, tax_no=?,
      contract_start=?, contract_end=?, bed_quota=?, price_per_bed=?, notes=?, is_active=?
    WHERE id=?
  `).run(
    data.name, data.contact_name || null, data.contact_phone || null, data.contact_email || null,
    data.tax_no || null, data.contract_start || null, data.contract_end || null,
    data.bed_quota ?? null, data.price_per_bed ?? null, data.notes || null,
    data.is_active === false ? 0 : 1, id
  )
}

export function deleteCompany(id) {
  const db = getDB()
  const inUse = db.prepare('SELECT COUNT(*) AS c FROM personnel WHERE company_id=? AND check_out_date IS NULL').get(id).c
  if (inUse > 0) throw new Error(`${inUse} aktif personel bu firmaya bağlı, silinemez`)
  db.prepare('DELETE FROM companies WHERE id=?').run(id)
}

export function expiringContracts(daysAhead = 30) {
  const db = getDB()
  return db.prepare(`
    SELECT id, name, contract_end,
      CAST(julianday(contract_end) - julianday('now') AS INTEGER) AS days_left
    FROM companies
    WHERE is_active=1 AND contract_end IS NOT NULL
      AND julianday(contract_end) - julianday('now') BETWEEN -7 AND ?
    ORDER BY contract_end ASC
  `).all(daysAhead)
}

export function companyStats() {
  const db = getDB()
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN contract_end IS NOT NULL AND julianday(contract_end) < julianday('now') THEN 1 ELSE 0 END) AS expired,
      SUM(bed_quota) AS total_quota
    FROM companies
  `).get()
}
