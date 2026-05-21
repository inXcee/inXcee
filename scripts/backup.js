#!/usr/bin/env node
/**
 * YYS DB Backup — better-sqlite3 online backup API kullanır.
 * Çalışan DB'yi kilitlemeden anlık tutarlı yedek alır.
 *
 * Kullanım:
 *   node scripts/backup.js
 *   DB_PATH=/var/data/yys.db BACKUP_DIR=/var/data/backups node scripts/backup.js
 *
 * PM2 ile otomatik: ecosystem.config.cjs'e cron_restart ekleyin veya
 * işletim sistemi cron'una: 0 3 * * * cd /app && node scripts/backup.js
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DB_PATH     = process.env.DB_PATH     || path.join(__dirname, '..', 'yys.db')
const BACKUP_DIR  = process.env.BACKUP_DIR  || path.join(path.dirname(DB_PATH), 'backups')
const KEEP_DAYS   = parseInt(process.env.BACKUP_KEEP_DAYS || '7', 10)

function pad(n) { return String(n).padStart(2, '0') }

function timestamp() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

async function run() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[Backup] DB bulunamadı: ${DB_PATH}`)
    process.exit(1)
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const dest = path.join(BACKUP_DIR, `yys_${timestamp()}.db`)
  const db = new Database(DB_PATH, { readonly: true })

  try {
    await db.backup(dest)
    const size = fs.statSync(dest).size
    console.log(`[Backup] OK: ${dest} (${(size / 1024).toFixed(1)} KB)`)
  } finally {
    db.close()
  }

  // Eski yedekleri temizle
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('yys_') && f.endsWith('.db'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .filter(f => f.mtime < cutoff)

  for (const f of files) {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name))
    console.log(`[Backup] Silindi (${KEEP_DAYS}g+): ${f.name}`)
  }

  // Off-site sync (Backblaze B2). Local yedek başarılı kabul edilir; B2 hatası kritik değil.
  const B2_REMOTE = process.env.B2_REMOTE || 'b2:avskamp-yys-backups'
  if (process.env.B2_SYNC_DISABLED === '1') {
    console.log('[Backup] B2 sync atlandı (B2_SYNC_DISABLED=1)')
    return
  }
  try {
    execSync(`rclone sync ${BACKUP_DIR} ${B2_REMOTE}`, {
      stdio: 'inherit',
      timeout: 5 * 60 * 1000,
    })
    console.log(`[Backup] B2 sync OK → ${B2_REMOTE}`)
  } catch (e) {
    console.error(`[Backup] B2 sync BAŞARISIZ (local yedek güvende): ${e.message}`)
  }
}

run().catch(e => {
  console.error('[Backup] HATA:', e.message)
  process.exit(1)
})
