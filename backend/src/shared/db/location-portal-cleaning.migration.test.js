import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const migration = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'migrations/108_location_portal_cleaning.sql'),
  'utf8',
)

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE staff(id INTEGER PRIMARY KEY);
    CREATE TABLE personnel(id INTEGER PRIMARY KEY);
    CREATE TABLE service_locations(id INTEGER PRIMARY KEY);
    CREATE TABLE cleaning_tasks(id INTEGER PRIMARY KEY);
    CREATE TABLE cleaning_task_photos(
      id INTEGER PRIMARY KEY,
      task_id INTEGER REFERENCES cleaning_tasks(id) ON DELETE CASCADE,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO staff VALUES(1);
    INSERT INTO personnel VALUES(2);
    INSERT INTO service_locations VALUES(3);
    INSERT INTO cleaning_tasks VALUES(4);
    INSERT INTO cleaning_task_photos(id,task_id) VALUES(5,4);
  `)
  db.exec(migration)
  return db
}

describe('migration 108 — QR temizlik doğrulaması', () => {
  it('mevcut görev fotoğraflarını korur ve çalışan bağını ekler', () => {
    const db = database()
    expect(db.prepare('SELECT id,task_id,uploaded_by_staff_id FROM cleaning_task_photos WHERE id=5').get())
      .toEqual({ id: 5, task_id: 4, uploaded_by_staff_id: null })
    db.prepare('UPDATE cleaning_task_photos SET uploaded_by_staff_id=1 WHERE id=5').run()
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('görev başına tek değerlendirme, geçerli puan ve eksik açıklaması zorlar', () => {
    const db = database()
    db.prepare('INSERT INTO cleaning_tasks VALUES(6)').run()
    db.prepare('INSERT INTO cleaning_tasks VALUES(7)').run()
    db.prepare(`
      INSERT INTO cleaning_task_reviews(task_id,location_id,reviewer_personnel_id,identity_mode,outcome,rating)
      VALUES(4,3,2,'resident_pin','approved',5)
    `).run()
    expect(() => db.prepare(`
      INSERT INTO cleaning_task_reviews(task_id,location_id,identity_mode,outcome)
      VALUES(4,3,'anonymous','approved')
    `).run()).toThrow()
    expect(() => db.prepare(`
      INSERT INTO cleaning_task_reviews(task_id,location_id,identity_mode,outcome,rating,comment)
      VALUES(6,3,'anonymous','approved',6,NULL)
    `).run()).toThrow()
    expect(() => db.prepare(`
      INSERT INTO cleaning_task_reviews(task_id,location_id,identity_mode,outcome,comment)
      VALUES(7,3,'anonymous','issue','x')
    `).run()).toThrow()
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('tamamlanan görev silinince değerlendirmeyi temizler, takip görevinde geçmişi korur', () => {
    const db = database()
    db.prepare('INSERT INTO cleaning_tasks VALUES(6)').run()
    db.prepare(`
      INSERT INTO cleaning_task_reviews(task_id,location_id,identity_mode,outcome,comment,followup_task_id)
      VALUES(4,3,'anonymous','issue','Tekrar temizlenmeli',6)
    `).run()
    db.prepare('DELETE FROM cleaning_tasks WHERE id=6').run()
    expect(db.prepare('SELECT followup_task_id FROM cleaning_task_reviews WHERE task_id=4').get().followup_task_id).toBeNull()
    db.prepare('DELETE FROM cleaning_tasks WHERE id=4').run()
    expect(db.prepare('SELECT COUNT(*) AS count FROM cleaning_task_reviews').get().count).toBe(0)
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })
})
