import { beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getDB, initDB } from '../../shared/db/index.js'
import { listPersonnelEvents, recordPersonnelEvent } from './tracking-events.js'

let staffId
let actorUserId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  const db = getDB()
  actorUserId = db.prepare(`
    INSERT INTO users(username, password_hash, full_name, role)
    VALUES('tracking-manager', 'test', 'Takip Yoneticisi', 'campus_manager')
  `).run().lastInsertRowid
  staffId = db.prepare(`
    INSERT INTO staff(full_name, is_active, hire_date)
    VALUES('Takip Test Personeli', 1, '2026-01-10')
  `).run().lastInsertRowid
})

describe('090 personnel tracking foundation', () => {
  it('backfills only the reliable open assignment project on an existing database', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE users(id INTEGER PRIMARY KEY);
      CREATE TABLE projects(id INTEGER PRIMARY KEY);
      CREATE TABLE staff(
        id INTEGER PRIMARY KEY,
        hire_date TEXT,
        is_active INTEGER,
        project_id INTEGER,
        department_id INTEGER,
        role_id INTEGER
      );
      CREATE TABLE staff_assignments(
        id INTEGER PRIMARY KEY,
        staff_id INTEGER NOT NULL REFERENCES staff(id),
        effective_from TEXT NOT NULL,
        effective_to TEXT
      );
      INSERT INTO projects(id) VALUES(7);
      INSERT INTO staff(id, hire_date, is_active, project_id, department_id, role_id)
      VALUES(10, '2024-01-01', 1, 7, 2, 3);
      INSERT INTO staff_assignments(id, staff_id, effective_from, effective_to)
      VALUES(1, 10, '2024-01-01', '2025-12-31'), (2, 10, '2026-01-01', NULL);
    `)

    const migrationPath = fileURLToPath(new URL('../../shared/db/migrations/090_personnel_tracking_foundation.sql', import.meta.url))
    db.exec(readFileSync(migrationPath, 'utf8'))

    const assignments = db.prepare('SELECT id, project_id FROM staff_assignments ORDER BY id').all()
    expect(assignments).toEqual([{ id: 1, project_id: null }, { id: 2, project_id: 7 }])
    const snapshot = db.prepare("SELECT * FROM personnel_tracking_events WHERE event_type='tracking_started'").get()
    expect(JSON.parse(snapshot.metadata_json)).toEqual({ backfilled: 1, history_complete: 0 })
    expect(() => db.prepare("UPDATE staff SET exit_type='invalid' WHERE id=10").run()).toThrow()
    db.close()
  })

  it('creates exit fields, project-aware assignments and immutable event storage', () => {
    const db = getDB()
    const staffColumns = new Set(db.prepare('PRAGMA table_info(staff)').all().map(row => row.name))
    const assignmentColumns = new Set(db.prepare('PRAGMA table_info(staff_assignments)').all().map(row => row.name))
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name))

    for (const field of ['offboarding_started_at', 'exit_date', 'exit_type', 'exit_reason', 'offboarding_owner_user_id']) {
      expect(staffColumns.has(field), field).toBe(true)
    }
    expect(assignmentColumns.has('project_id')).toBe(true)
    expect(tables.has('personnel_tracking_events')).toBe(true)
  })

  it('records ordered revisions with structured before and after values', () => {
    const first = recordPersonnelEvent({
      staffId,
      eventType: 'shift_changed',
      effectiveAt: '2026-08-01',
      sourceType: 'shift_schedule',
      sourceId: 501,
      before: { shift_id: 1 },
      after: { shift_id: 2 },
      reason: 'Vardiya ihtiyaci degisti',
      actorUserId,
      metadata: { channel: 'manual' },
    })
    const second = recordPersonnelEvent({
      staffId,
      eventType: 'shift_changed',
      effectiveAt: '2026-08-01',
      sourceType: 'shift_schedule',
      sourceId: 501,
      before: { shift_id: 2 },
      after: { shift_id: 3 },
      reason: 'Personel talebi',
      actorUserId,
    })

    expect(first.revision_no).toBe(1)
    expect(second.revision_no).toBe(2)
    expect(second.before).toEqual({ shift_id: 2 })
    expect(second.after).toEqual({ shift_id: 3 })
    expect(first.metadata).toEqual({ channel: 'manual' })

    const rows = listPersonnelEvents({ staffId, sourceType: 'shift_schedule', sourceId: 501 })
    expect(rows.map(row => row.revision_no)).toEqual([2, 1])
  })

  it('requires reasons for revisions and rejects unsupported event types', () => {
    expect(() => recordPersonnelEvent({
      staffId,
      eventType: 'leave_changed',
      effectiveAt: '2026-08-02',
      sourceType: 'leave_request',
      sourceId: 77,
      after: { status: 'approved' },
    })).toThrow('aciklama zorunlu')

    expect(() => recordPersonnelEvent({
      staffId,
      eventType: 'unknown_event',
      effectiveAt: '2026-08-02',
    })).toThrow('desteklenmiyor')
  })

  it('prevents update and delete at database level', () => {
    const db = getDB()
    const row = recordPersonnelEvent({
      staffId,
      eventType: 'absence_recorded',
      effectiveAt: '2026-08-03',
      sourceType: 'shift_schedule',
      sourceId: 900,
      after: { status: 'absent' },
      reason: 'Kart kaydi yok',
      actorUserId,
    })

    expect(() => db.prepare('UPDATE personnel_tracking_events SET reason=? WHERE id=?').run('degisti', row.id))
      .toThrow('immutable')
    expect(() => db.prepare('DELETE FROM personnel_tracking_events WHERE id=?').run(row.id))
      .toThrow('immutable')
  })

  it('filters events by inclusive effective date and event type', () => {
    recordPersonnelEvent({
      staffId,
      eventType: 'overtime_changed',
      effectiveAt: '2026-08-05 09:30:00',
      sourceType: 'overtime_record',
      sourceId: 12,
      after: { hours: 3 },
      reason: 'Onayli mesai',
      actorUserId,
    })

    const rows = listPersonnelEvents({
      staffId,
      eventTypes: ['overtime_changed'],
      from: '2026-08-05',
      to: '2026-08-05',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].after.hours).toBe(3)
  })
})
