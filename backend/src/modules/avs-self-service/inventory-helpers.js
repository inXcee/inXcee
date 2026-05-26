import { getDB } from '../../shared/db/index.js'

// Departman ADINA göre envanter kategorisi (id sırası prod'da değişebilir).
// Eşleşme yoksa null → envanter erişimi yok.
export function departmentToInventoryCategory(deptName) {
  const n = (deptName || '').toLowerCase()
  if (n.includes('temizlik')) return 'housekeeping'
  if (n.includes('teknik')) return 'maintenance'
  if (n.includes('çama') || n.includes('cama')) return 'laundry'
  return null
}

// created_by için login edilemez sistem kullanıcısı (idempotent).
// password_hash='!' geçerli bcrypt değil → bu hesapla login imkansız.
// Gerçek "kim aldı" = inventory_checkouts.staff_id; bu sadece "kaydeden".
export function getKioskSystemUserId() {
  const db = getDB()
  db.prepare(`INSERT OR IGNORE INTO users(username, password_hash, role, full_name)
              VALUES('avs_kiosk_system', '!', 'housekeeper', 'AVS Kiosk Sistemi')`).run()
  return db.prepare("SELECT id FROM users WHERE username='avs_kiosk_system'").get().id
}
