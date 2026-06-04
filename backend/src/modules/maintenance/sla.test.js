import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { findSlaBreaches, findSlaPreWarnings, checkMaintenanceSla, PRE_WARN_HOURS } from './sla.js'

let db
beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
})

// Her testten önce maintenance_requests'i temizle — testler arası izolasyon
beforeEach(() => {
  db.prepare('DELETE FROM maintenance_requests').run()
})

// sla_deadline'ı şimdiden ofset saat ile bir talep ekler (negatif = geçmiş).
// `id` verilirse açık id ile ekler — dedup_key testler arası çakışmasın diye.
function seedRequest({ id = null, status = 'open', priority = 'medium', deadlineHours = -1, location = 'M1 Kat 1 Oda 101', deadlineNull = false } = {}) {
  const deadlineSql = deadlineNull ? 'NULL' : "datetime('now', ?)"
  const cols = id != null ? 'id, location' : 'location'
  const placeholders = id != null ? '?, ?' : '?'
  const params = id != null ? [id, location] : [location]
  const r = db.prepare(`
    INSERT INTO maintenance_requests(${cols}, description, priority, status, opened_at, sla_deadline)
    VALUES (${placeholders}, 'test', ?, ?, datetime('now','-5 hours'), ${deadlineSql})
  `).run(...params, priority, status, ...(deadlineNull ? [] : [`${deadlineHours >= 0 ? '+' : ''}${deadlineHours} hours`]))
  return id != null ? id : r.lastInsertRowid
}

describe('findSlaBreaches', () => {
  it('returns open requests whose sla_deadline is in the past', () => {
    const id = seedRequest({ status: 'open', deadlineHours: -2 })
    const rows = findSlaBreaches(db)
    expect(rows.map(r => r.id)).toContain(id)
  })

  it('returns in_progress requests whose sla_deadline is in the past', () => {
    const id = seedRequest({ status: 'in_progress', deadlineHours: -2 })
    const rows = findSlaBreaches(db)
    expect(rows.map(r => r.id)).toContain(id)
  })

  it('does not return done requests even if deadline is past', () => {
    const id = seedRequest({ status: 'done', deadlineHours: -2 })
    const rows = findSlaBreaches(db)
    expect(rows.map(r => r.id)).not.toContain(id)
  })

  it('does not return requests whose deadline is in the future', () => {
    const id = seedRequest({ status: 'open', deadlineHours: +2 })
    const rows = findSlaBreaches(db)
    expect(rows.map(r => r.id)).not.toContain(id)
  })

  it('does not return requests with NULL sla_deadline', () => {
    const id = seedRequest({ status: 'open', deadlineNull: true })
    const rows = findSlaBreaches(db)
    expect(rows.map(r => r.id)).not.toContain(id)
  })
})

describe('findSlaPreWarnings', () => {
  it('returns open requests within PRE_WARN_HOURS of their deadline', () => {
    // PRE_WARN_HOURS=1 → deadline 0.5 saat sonra
    const id = seedRequest({ status: 'open', deadlineHours: +0.5 })
    const rows = findSlaPreWarnings(db)
    expect(rows.map(r => r.id)).toContain(id)
  })

  it('does not return requests already breached (deadline in past)', () => {
    const id = seedRequest({ status: 'open', deadlineHours: -1 })
    const rows = findSlaPreWarnings(db)
    expect(rows.map(r => r.id)).not.toContain(id)
  })

  it('does not return requests whose deadline is further than PRE_WARN_HOURS away', () => {
    const id = seedRequest({ status: 'open', deadlineHours: PRE_WARN_HOURS + 3 })
    const rows = findSlaPreWarnings(db)
    expect(rows.map(r => r.id)).not.toContain(id)
  })

  it('does not return done requests near deadline', () => {
    const id = seedRequest({ status: 'done', deadlineHours: +0.5 })
    const rows = findSlaPreWarnings(db)
    expect(rows.map(r => r.id)).not.toContain(id)
  })
})

describe('checkMaintenanceSla', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM notifications').run()
  })

  it('creates a critical breach notification with the correct dedup_key', () => {
    const id = seedRequest({ id: 9001, status: 'open', priority: 'high', deadlineHours: -3 })
    checkMaintenanceSla()
    const notif = db.prepare('SELECT * FROM notifications WHERE dedup_key = ?').get(`maint_sla_breach_${id}`)
    expect(notif).toBeTruthy()
    expect(notif.severity).toBe('critical')
    expect(notif.module).toBe('maintenance')
    expect(notif.entity_id).toBe(id)
  })

  it('creates a warning notification for pre-warning requests', () => {
    const id = seedRequest({ id: 9002, status: 'open', deadlineHours: +0.5 })
    checkMaintenanceSla()
    const notif = db.prepare('SELECT * FROM notifications WHERE dedup_key = ?').get(`maint_sla_warn_${id}`)
    expect(notif).toBeTruthy()
    expect(notif.severity).toBe('warning')
  })

  it('does not create a duplicate breach notification on a second same-day call', () => {
    const id = seedRequest({ id: 9003, status: 'open', deadlineHours: -3 })
    checkMaintenanceSla()
    checkMaintenanceSla()
    const count = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE dedup_key = ?').get(`maint_sla_breach_${id}`).c
    expect(count).toBe(1)
  })

  it('returns the count of breaches and warnings', () => {
    seedRequest({ id: 9004, status: 'open', deadlineHours: -2 })
    seedRequest({ id: 9005, status: 'in_progress', deadlineHours: -1 })
    seedRequest({ id: 9006, status: 'open', deadlineHours: +0.5 })
    const result = checkMaintenanceSla()
    expect(result).toEqual({ breaches: 2, warnings: 1 })
  })
})
