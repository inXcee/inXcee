import { getDB } from '../../shared/db/index.js'
import bcrypt from 'bcryptjs'

// AVS workers artık staff tablosundan okunur — tek kaynak (single source of truth)
// Geriye dönük API uyumluluğu için bu modül staff sorgularını wrap eder.

const ROLE_DEPT_MAP = [
  { match: /kat|meydanc|temizlik/i, dept_id: 2 },
  { match: /(çama|cama)şır|laundry/i, dept_id: 8 },
  { match: /teknik|bakım|bakim/i, dept_id: 5 },
  { match: /güvenlik|guvenlik|security/i, dept_id: 1 },
  { match: /mutfak|aşçı|asci/i, dept_id: 3 },
  { match: /idari|ofis|admin/i, dept_id: 4 },
  { match: /bahçe|bahce/i, dept_id: 6 },
  { match: /sağlık|saglik|revir/i, dept_id: 7 },
]
export function deptIdFromRole(label) {
  if (!label) return null
  const m = ROLE_DEPT_MAP.find(r => r.match.test(label))
  return m?.dept_id || null
}

// Listede yalnız role_label dolu olanları AVS personeli sayıyoruz (kiosk_pin opsiyonel)
// Boş role_label'lar saf vardiya personeli — AVS sayfasında listelenmez
export function listWorkers() {
  return getDB().prepare(`
    SELECT s.id, s.full_name, s.role_label, s.is_active, s.created_at,
      s.kiosk_pin IS NOT NULL as has_pin,
      d.id as department_id, d.name as department_name
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.role_label IS NOT NULL OR s.kiosk_pin IS NOT NULL
    ORDER BY s.full_name
  `).all()
}

export function getWorker(id) {
  return getDB().prepare(`
    SELECT s.id, s.full_name, s.role_label, s.is_active, s.created_at,
      s.kiosk_pin IS NOT NULL as has_pin,
      d.id as department_id, d.name as department_name
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.id=?
  `).get(id)
}

export function createWorker({ full_name, role_label }) {
  const deptId = deptIdFromRole(role_label)
  const r = getDB().prepare(`
    INSERT INTO staff(full_name, role_label, position, department_id, is_active)
    VALUES(?,?,?,?,1)
  `).run(full_name, role_label || null, role_label || null, deptId)
  return r.lastInsertRowid
}

export function updateWorker(id, { full_name, role_label }) {
  const db = getDB()
  // Kullanıcı departmanı manuel atadıysa ezme — sadece role_label'dan türetilen departman boşsa güncelle
  const current = db.prepare('SELECT department_id FROM staff WHERE id=?').get(id)
  const newDept = deptIdFromRole(role_label)
  db.prepare(`
    UPDATE staff SET full_name=?, role_label=?,
      position = COALESCE(NULLIF(position, ''), ?),
      department_id = COALESCE(department_id, ?)
    WHERE id=?
  `).run(full_name, role_label || null, role_label || null, current?.department_id ?? newDept, id)
}

export function setWorkerPin(id, pin) {
  const hash = bcrypt.hashSync(pin, 10)
  getDB().prepare('UPDATE staff SET kiosk_pin=? WHERE id=?').run(hash, id)
}

export function toggleWorker(id) {
  getDB().prepare('UPDATE staff SET is_active = 1 - is_active WHERE id=?').run(id)
  return getDB().prepare('SELECT is_active FROM staff WHERE id=?').get(id)
}

export function deleteWorker(id) {
  // Hard-delete yerine sadece AVS işaretini kaldır (vardiya geçmişi kalır)
  return getDB().prepare(`
    UPDATE staff SET role_label=NULL, kiosk_pin=NULL WHERE id=?
  `).run(id).changes > 0
}
