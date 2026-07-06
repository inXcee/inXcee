import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { findExpiringContracts, checkExpiringContracts } from './contractAlerts.js'

let db, dept, sCrit, sWarn, sExpired

function dateOffset(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()

  // Deterministik: tüm seed personelinin contract_end'ini temizle
  db.prepare('UPDATE staff SET contract_end = NULL').run()

  dept = db.prepare("INSERT INTO departments(name, color_class) VALUES('HR-Test-Dept','c1')").run().lastInsertRowid

  const ins = db.prepare("INSERT INTO staff(full_name, department_id, is_active, contract_end) VALUES (?,?,?,?)")
  sCrit = ins.run('Kritik Kişi', dept, 1, dateOffset(5)).lastInsertRowid      // ≤7g → critical
  sWarn = ins.run('Uyarı Kişi', dept, 1, dateOffset(20)).lastInsertRowid      // 8-30g → warning
  ins.run('Uzak Kişi', dept, 1, dateOffset(100))                              // >30g → atlanır
  ins.run('Sözleşmesiz', dept, 1, null)                                       // NULL → atlanır
  ins.run('Pasif Kişi', dept, 0, dateOffset(10))                             // is_active=0 → atlanır
  sExpired = ins.run('Süresi Geçmiş', dept, 1, dateOffset(-3)).lastInsertRowid // negatif → döner
})

describe('findExpiringContracts', () => {
  it('returns active staff whose contract ends within the warn window', () => {
    const ids = findExpiringContracts(db).map(r => r.id)
    expect(ids).toContain(sCrit)
    expect(ids).toContain(sWarn)
  })

  it('includes expired-but-active contracts', () => {
    const ids = findExpiringContracts(db).map(r => r.id)
    expect(ids).toContain(sExpired)
  })

  it('excludes contracts beyond the warn window, NULL, and inactive staff', () => {
    const rows = findExpiringContracts(db)
    const names = rows.map(r => r.full_name)
    expect(names).not.toContain('Uzak Kişi')
    expect(names).not.toContain('Sözleşmesiz')
    expect(names).not.toContain('Pasif Kişi')
  })

  it('computes days_left (positive for upcoming, negative for expired)', () => {
    const rows = findExpiringContracts(db)
    expect(rows.find(r => r.id === sCrit).days_left).toBe(5)
    expect(rows.find(r => r.id === sExpired).days_left).toBe(-3)
  })
})

describe('checkExpiringContracts', () => {
  // Tek test: createNotification'ın in-memory 60s dedup cache'i ayrı `it`'ler
  // arasında taşıdığı için severity + count + dedup tek çağrı dizisinde doğrulanır.
  it('creates severity-correct, deduplicated notifications and returns the count', () => {
    db.prepare('DELETE FROM notifications').run()

    const r = checkExpiringContracts()
    expect(r.count).toBe(3) // kritik + uyarı + süresi-geçmiş

    const crit = db.prepare('SELECT * FROM notifications WHERE dedup_key = ?').get(`hr_contract_expiry_${sCrit}`)
    const warn = db.prepare('SELECT * FROM notifications WHERE dedup_key = ?').get(`hr_contract_expiry_${sWarn}`)
    const expired = db.prepare('SELECT * FROM notifications WHERE dedup_key = ?').get(`hr_contract_expiry_${sExpired}`)
    expect(crit?.severity).toBe('critical')
    expect(crit.module).toBe('hr')
    expect(warn?.severity).toBe('warning')
    expect(expired?.severity).toBe('critical') // süresi geçmiş = kritik

    // İkinci çağrı aynı gün duplicate üretmez
    checkExpiringContracts()
    const c = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE dedup_key = ?').get(`hr_contract_expiry_${sCrit}`).c
    expect(c).toBe(1)
  })
})
