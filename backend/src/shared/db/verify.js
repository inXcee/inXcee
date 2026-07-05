import { getDB } from './index.js'

// Migration verify — 2026-05-18 dersi: initDB migration'ları sessizce skip edebiliyor
// (index/trigger oluşmadan uygulama ayağa kalkıyor). Kritik nesnelerin varlığını
// sqlite_master'dan doğrular; /api/health bu sonucu döner, eksikte 'degraded'.
export const EXPECTED_OBJECTS = {
  trigger: [
    'block_quarantine_assignment',
    'trg_inventory_quantity_nonneg',
  ],
  index: [
    'idx_personnel_fullname',
    'idx_audit_user',
    'idx_notif_role',
    'idx_training_date',
    'idx_training_attendances_staff',
    'idx_work_accidents_date',
  ],
}

export function verifySchemaObjects() {
  const db = getDB()
  const missing = []
  for (const [type, names] of Object.entries(EXPECTED_OBJECTS)) {
    const found = new Set(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = ? AND name IN (${names.map(() => '?').join(',')})`)
        .all(type, ...names).map(r => r.name)
    )
    names.forEach(n => { if (!found.has(n)) missing.push(`${type}:${n}`) })
  }
  return { ok: missing.length === 0, missing }
}
