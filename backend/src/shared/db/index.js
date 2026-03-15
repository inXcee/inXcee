import Database from 'better-sqlite3'
import { SCHEMA } from './schema.js'

let db

export function initDB() {
  const path = process.env.DB_PATH || 'yys.db'
  db = new Database(path)
  db.exec(SCHEMA)
  return db
}

export function getDB() {
  if (!db) throw new Error('DB not initialized')
  return db
}
