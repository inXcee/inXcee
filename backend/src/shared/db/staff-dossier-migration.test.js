import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, initDB } from './index.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
})

describe('057 staff dossier foundation migration', () => {
  it('creates dossier tables and document metadata columns', () => {
    const db = getDB()
    const tables = new Set(db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all().map(row => row.name))
    expect(tables.has('staff_personnel_links')).toBe(true)
    expect(tables.has('staff_document_requirements')).toBe(true)
    expect(tables.has('staff_followups')).toBe(true)

    const documentColumns = new Set(
      db.prepare('PRAGMA table_info(documents)').all().map(column => column.name)
    )
    for (const column of [
      'staff_id', 'document_kind', 'document_no', 'issued_on', 'expires_on',
      'visibility', 'version_group', 'archived_at',
    ]) {
      expect(documentColumns.has(column), column).toBe(true)
    }

    const noteColumns = new Set(
      db.prepare('PRAGMA table_info(staff_notes)').all().map(column => column.name)
    )
    for (const column of ['category', 'visibility', 'updated_at', 'archived_at']) {
      expect(noteColumns.has(column), column).toBe(true)
    }
  })

  it('stores a confirmed canonical staff/personnel link', () => {
    const db = getDB()
    const personnelId = db.prepare(
      "INSERT INTO personnel(tc_no, full_name) VALUES('70000000001', 'Yatakhane Kaydı')"
    ).run().lastInsertRowid
    const staffId = db.prepare(
      "INSERT INTO staff(tc_no, full_name, is_active) VALUES('70000000001', 'Çalışan Kaydı', 1)"
    ).run().lastInsertRowid

    db.prepare(`
      INSERT INTO staff_personnel_links(staff_id, personnel_id, link_method, link_status)
      VALUES(?, ?, 'tc_unique', 'confirmed')
    `).run(staffId, personnelId)

    const link = db.prepare(
      'SELECT * FROM staff_personnel_links WHERE staff_id=?'
    ).get(staffId)
    expect(link.personnel_id).toBe(personnelId)
    expect(link.link_status).toBe('confirmed')
  })

  it('enforces follow-up status and completion consistency', () => {
    const db = getDB()
    const staffId = db.prepare(
      "INSERT INTO staff(full_name, is_active) VALUES('Takip Personeli', 1)"
    ).run().lastInsertRowid

    expect(() => db.prepare(`
      INSERT INTO staff_followups(staff_id, title, status)
      VALUES(?, 'Eksik belge', 'done')
    `).run(staffId)).toThrow()

    const id = db.prepare(`
      INSERT INTO staff_followups(staff_id, title, status, completed_at)
      VALUES(?, 'Eksik belge', 'done', CURRENT_TIMESTAMP)
    `).run(staffId).lastInsertRowid
    expect(id).toBeTruthy()
  })

  it('seeds the minimum required document catalogue', () => {
    const rows = getDB().prepare(`
      SELECT document_kind, visibility
      FROM staff_document_requirements
      WHERE department_id IS NULL AND role_id IS NULL AND is_active=1
    `).all()
    const kinds = new Set(rows.map(row => row.document_kind))
    expect(kinds.has('identity')).toBe(true)
    expect(kinds.has('contract')).toBe(true)
    expect(kinds.has('health_report')).toBe(true)
    expect(kinds.has('training')).toBe(true)
  })
})
