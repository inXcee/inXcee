import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getDbPath() {
  return process.env.DB_PATH || path.join(__dirname, '..', '..', '..', '..', 'yys.db')
}

function getBackupDir() {
  return process.env.BACKUP_DIR || path.join(path.dirname(getDbPath()), 'backups')
}

function pad(n) { return String(n).padStart(2, '0') }

function timestamp() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

// Path traversal koruması — dosya adı sadece yedek dizini altında olabilir
function safeBackupPath(name) {
  if (!name || /[\\/]/.test(name) || name.includes('..')) return null
  if (!/^[a-zA-Z0-9._-]+\.db$/.test(name)) return null
  const dir = getBackupDir()
  const full = path.join(dir, name)
  // path.resolve karşılaştırması — symlink/path tricks güvenliği
  const resolved = path.resolve(full)
  const resolvedDir = path.resolve(dir)
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) return null
  return resolved
}

export function listBackupsService() {
  const dir = getBackupDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.startsWith('yys_') && f.endsWith('.db'))
    .map(f => {
      const full = path.join(dir, f)
      const stat = fs.statSync(full)
      return { name: f, size: stat.size, created_at: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// Off-site push: OFFSITE_BACKUP_CMD env'ini calistirir, ${FILE} placeholder yerine
// yedek dosya yolunu koyar. Ornekler:
//   OFFSITE_BACKUP_CMD='rclone copy ${FILE} b2:yys-backups/'
//   OFFSITE_BACKUP_CMD='aws s3 cp ${FILE} s3://yys-backups/'
//   OFFSITE_BACKUP_CMD='scp ${FILE} user@backup.example:/var/backups/yys/'
// Komut tanimlanmamissa skip — local backup tek koruma. Bu disaster recovery
// icin kritik, prod'da MUTLAKA tanimlanmalidir.
export async function pushOffsite(filePath) {
  const cmdTemplate = process.env.OFFSITE_BACKUP_CMD
  if (!cmdTemplate) return { skipped: true, reason: 'OFFSITE_BACKUP_CMD tanimli degil' }

  return new Promise((resolve) => {
    const cmd = cmdTemplate.replace(/\$\{FILE\}/g, filePath)
    // shell:true gerekli — kullanici tam komutu tanimliyor (rclone, aws, scp...)
    const proc = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
    }, 10 * 60 * 1000) // 10dk hard timeout
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ ok: true, code, stdout: stdout.slice(0, 500) })
      } else {
        console.error('[Backup offsite] failed:', code, stderr.slice(0, 1000))
        resolve({ ok: false, code, stderr: stderr.slice(0, 500) })
      }
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      console.error('[Backup offsite] spawn error:', err.message)
      resolve({ ok: false, error: err.message })
    })
  })
}

export async function runBackupService() {
  const dbPath = getDbPath()
  const dir = getBackupDir()
  if (!fs.existsSync(dbPath)) {
    try {
      createNotification({
        message: `🛑 Yedekleme başarısız: veritabanı dosyası bulunamadı`,
        event_kind: EVENT_KINDS.SYSTEM_BACKUP_FAILED,
        target_role: 'campus_manager',
      })
    } catch {}
    return { error: 'Veritabanı dosyası bulunamadı', status: 500 }
  }
  fs.mkdirSync(dir, { recursive: true })

  const dest = path.join(dir, `yys_${timestamp()}.db`)
  const db = new Database(dbPath, { readonly: true })
  try {
    try {
      await db.backup(dest)
    } catch (e) {
      try {
        createNotification({
          message: `🛑 Yedekleme başarısız: ${e.message || 'bilinmeyen hata'}`,
          event_kind: EVENT_KINDS.SYSTEM_BACKUP_FAILED,
          target_role: 'campus_manager',
        })
      } catch {}
      throw e
    }
  } finally {
    db.close()
  }
  const stat = fs.statSync(dest)
  // Off-site push — basarisizlik local backup'i etkilemez, sadece response'da goster
  const offsite = await pushOffsite(dest)
  // A→Z: başarı bildirimi
  try {
    const sizeMb = (stat.size / 1024 / 1024).toFixed(1)
    createNotification({
      message: `✅ Yedekleme tamamlandı: ${path.basename(dest)} (${sizeMb} MB)${offsite?.ok ? ' · offsite ✓' : offsite?.skipped ? '' : ' · offsite ✕'}`,
      event_kind: EVENT_KINDS.SYSTEM_BACKUP_SUCCESS,
      target_role: 'campus_manager',
      dedup_key: `backup_success_${new Date().toISOString().slice(0, 10)}`,
    })
  } catch {}
  return {
    ok: true,
    name: path.basename(dest),
    size: stat.size,
    created_at: stat.mtime.toISOString(),
    offsite,
  }
}

export function getBackupFileService(name) {
  const full = safeBackupPath(name)
  if (!full) return { error: 'Geçersiz dosya adı', status: 400 }
  if (!fs.existsSync(full)) return { error: 'Yedek bulunamadı', status: 404 }
  return { ok: true, path: full, name }
}

export function deleteBackupService(name) {
  const full = safeBackupPath(name)
  if (!full) return { error: 'Geçersiz dosya adı', status: 400 }
  if (!fs.existsSync(full)) return { error: 'Yedek bulunamadı', status: 404 }
  fs.unlinkSync(full)
  return { ok: true }
}

// Restore: yüklenen dosyayı doğrula → mevcut DB'yi pre-restore yedeğine al → değiştir
// Geri dönüş: process.exit(0) çağrılır, PM2 restart eder. Standalone'da manuel restart şart.
export async function restoreBackupService(uploadedPath) {
  if (!uploadedPath || !fs.existsSync(uploadedPath)) {
    return { error: 'Yüklenen dosya bulunamadı', status: 400 }
  }

  // Geçerli SQLite mi VE YYS şemasında mı kontrol et
  // Aksi halde kötü niyetli admin önceden bildiği password_hash içeren bir DB
  // yükleyip privilege escalation yapabilir
  let testDb
  try {
    testDb = new Database(uploadedPath, { readonly: true })
    testDb.prepare('SELECT name FROM sqlite_master LIMIT 1').get()
    const REQUIRED = ['users', 'rooms', 'personnel', 'staff']
    const found = testDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${REQUIRED.map(() => '?').join(',')})`
    ).all(...REQUIRED).map(r => r.name)
    const missing = REQUIRED.filter(t => !found.includes(t))
    if (missing.length > 0) {
      try { fs.unlinkSync(uploadedPath) } catch { /* ignore */ }
      return { error: `Yedek YYS şeması içermiyor (eksik: ${missing.join(', ')})`, status: 400 }
    }
  } catch (e) {
    try { fs.unlinkSync(uploadedPath) } catch { /* ignore */ }
    return { error: 'Geçersiz SQLite dosyası', status: 400 }
  } finally {
    try { testDb?.close() } catch { /* ignore */ }
  }

  const dbPath = getDbPath()
  const dir = getBackupDir()
  fs.mkdirSync(dir, { recursive: true })

  // Mevcut DB'yi pre-restore yedeği olarak sakla
  const preName = `yys_pre-restore_${timestamp()}.db`
  const prePath = path.join(dir, preName)
  if (fs.existsSync(dbPath)) {
    try {
      const cur = new Database(dbPath, { readonly: true })
      try { await cur.backup(prePath) } finally { cur.close() }
    } catch (e) {
      try { fs.unlinkSync(uploadedPath) } catch { /* ignore */ }
      return { error: 'Mevcut yedek alınamadı: ' + e.message, status: 500 }
    }
  }

  // Replace
  try {
    fs.copyFileSync(uploadedPath, dbPath)
    fs.unlinkSync(uploadedPath)
  } catch (e) {
    return { error: 'DB dosyası değiştirilemedi: ' + e.message, status: 500 }
  }

  return { ok: true, pre_restore_backup: preName, requires_restart: true }
}
