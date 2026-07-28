import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const e2eDir = dirname(fileURLToPath(import.meta.url))
const tempDir = resolve(e2eDir, '.tmp')
const dbPath = resolve(process.env.DB_PATH || '')
const uploadsPath = resolve(process.env.UPLOADS_DIR || '')
if (dirname(tempDir) !== e2eDir
  || dirname(dbPath) !== tempDir
  || dirname(uploadsPath) !== tempDir) {
  throw new Error('E2E geçici yolları güvenli çalışma alanının dışında')
}
mkdirSync(tempDir, { recursive: true })
mkdirSync(uploadsPath, { recursive: true })

await import('../../backend/src/server.js')
