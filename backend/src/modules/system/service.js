import fs from 'fs'
import path from 'path'
import os from 'os'
import v8 from 'v8'
import { fileURLToPath } from 'url'
import { getDB } from '../../shared/db/index.js'
import { listBackupsService } from '../backup/service.js'
import { getStats as getJobStats } from '../../shared/jobs/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_STARTED_AT = new Date().toISOString()

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      try {
        if (e.isDirectory()) total += dirSize(full)
        else total += fs.statSync(full).size
      } catch { /* ignore unreadable file */ }
    }
  } catch { /* ignore */ }
  return total
}

function getDbInfo() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', '..', '..', 'yys.db')
  const info = { path: dbPath, size: 0, exists: false }
  try {
    if (fs.existsSync(dbPath) && dbPath !== ':memory:') {
      info.exists = true
      info.size = fs.statSync(dbPath).size
    }
  } catch { /* ignore */ }
  return info
}

function getDbStats() {
  const db = getDB()
  const safeCount = (sql) => {
    try { return db.prepare(sql).get()?.c || 0 } catch { return null }
  }
  return {
    users: safeCount('SELECT COUNT(*) as c FROM users'),
    personnel: safeCount('SELECT COUNT(*) as c FROM personnel'),
    rooms: safeCount('SELECT COUNT(*) as c FROM rooms'),
    laundry_items: safeCount('SELECT COUNT(*) as c FROM laundry_items'),
    notifications: safeCount('SELECT COUNT(*) as c FROM notifications'),
    audit_log: safeCount('SELECT COUNT(*) as c FROM audit_log'),
    error_log_24h: safeCount(`SELECT COUNT(*) as c FROM error_log WHERE created_at > datetime('now','-1 day')`),
    error_log_total: safeCount('SELECT COUNT(*) as c FROM error_log'),
  }
}

export function getSystemInfoService() {
  const db = getDbInfo()
  const backups = listBackupsService()
  const uploadsDir = process.env.UPLOADS_DIR || 'uploads'
  const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(db.path), 'backups')

  const mem = process.memoryUsage()
  const heapPercent = Math.round((mem.heapUsed / v8.getHeapStatistics().heap_size_limit) * 100)

  let jobStats = { pending: 0, processing: 0, failed: 0 }
  try { jobStats = getJobStats() } catch { /* jobs not initialized in test */ }

  return {
    server: {
      started_at: SERVER_STARTED_AT,
      uptime_sec: Math.floor(process.uptime()),
      node_version: process.version,
      env: process.env.NODE_ENV || 'development',
      platform: process.platform,
      memory: {
        rss_mb: +(mem.rss / 1024 / 1024).toFixed(1),
        heap_used_mb: +(mem.heapUsed / 1024 / 1024).toFixed(1),
        heap_total_mb: +(mem.heapTotal / 1024 / 1024).toFixed(1),
      },
      hostname: os.hostname(),
      load_avg: os.loadavg().map(n => +n.toFixed(2)),
      heap_percent: heapPercent,
    },
    jobs: jobStats,
    database: db,
    stats: getDbStats(),
    backups: {
      count: backups.length,
      last: backups[0] || null,
      dir: backupDir,
      total_size: backups.reduce((s, b) => s + b.size, 0),
    },
    storage: {
      uploads_size: dirSize(uploadsDir),
      uploads_dir: uploadsDir,
    },
    cron: {
      backup: '03:00 (gece)',
      cleanup: '02:00 (gece)',
      sla_check: '*/15 dakika',
      premium_alert: '50 5 * * *',
    },
  }
}
