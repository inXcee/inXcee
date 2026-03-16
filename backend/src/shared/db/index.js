import Database from 'better-sqlite3'
import { SCHEMA } from './schema.js'

let db

function runMigrations(database) {
  const cols = database.prepare('PRAGMA table_info(personnel)').all().map(c => c.name)
  if (!cols.includes('gender'))
    database.exec("ALTER TABLE personnel ADD COLUMN gender TEXT CHECK(gender IN ('male','female'))")
  if (!cols.includes('department_id'))
    database.exec('ALTER TABLE personnel ADD COLUMN department_id INTEGER REFERENCES departments(id)')
}

export function initDB() {
  const path = process.env.DB_PATH || 'yys.db'
  db = new Database(path)
  db.exec(SCHEMA)
  runMigrations(db)
  return db
}

export function getDB() {
  if (!db) throw new Error('DB not initialized')
  return db
}
