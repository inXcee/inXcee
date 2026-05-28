import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { logAudit } from './audit.js'
import { initDB, getDB } from './db/index.js'
import { register, _resetForTests } from './metrics.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
})

beforeEach(() => {
  _resetForTests()
})

describe('logAudit', () => {
  it('başarılı yazımda audit_log satırı ekler', () => {
    const db = getDB()
    const before = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c
    logAudit(null, 'test.action', 'test-module', 1, 'detay')
    const after = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c
    expect(after).toBe(before + 1)
  })

  it('FK ihlalinde (geçersiz user_id) hata fırlatmaz, ana işlemi bozmaz', () => {
    // user_id REFERENCES users(id) — users'ta olmayan ID FK ihlali tetikler.
    expect(() => logAudit(999999, 'fk.fail', 'broken-module', 1, null)).not.toThrow()
  })

  it('yazma başarısızsa audit_write_failures_total sayacını artırır', async () => {
    logAudit(999999, 'fk.fail', 'broken-module', 1, null)
    const text = await register.metrics()
    expect(text).toMatch(/audit_write_failures_total\{[^}]*module="broken-module"[^}]*\}\s+1/)
  })
})
