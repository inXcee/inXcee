// SQLite tabanli job queue. Tek worker varsayilir (PM2 instances:1).
// Handler hata firlatirsa retry (exponential backoff). err.permanent=true ise retry yok.
//
// Atomik claim: BEGIN IMMEDIATE transaction icinde SELECT + UPDATE status='processing'.
// Bu sayede ileride coklu worker'a gecilse bile race condition olmaz (SQLite write lock).

import { getDB } from '../db/index.js'
import { logger } from '../logger.js'
import { handlers } from './handlers.js'

let workerTimer = null
let workerRunning = false

export function enqueue(type, payload, opts = {}) {
  const db = getDB()
  const runAfter = opts.runAfter ?? Math.floor(Date.now() / 1000)
  const maxAttempts = opts.maxAttempts ?? 3
  const result = db.prepare(`
    INSERT INTO job_queue(type, payload, run_after, max_attempts)
    VALUES(?,?,?,?)
  `).run(type, JSON.stringify(payload), runAfter, maxAttempts)
  return result.lastInsertRowid
}

// Tek bir tick: bir is varsa onu islet, true don. Yoksa false.
export async function tickOnce() {
  const db = getDB()
  const now = Math.floor(Date.now() / 1000)

  // Atomik claim: BEGIN IMMEDIATE ile write lock al, en eski pending'i isaretle.
  let job
  const claim = db.transaction(() => {
    job = db.prepare(`
      SELECT id, type, payload, attempts, max_attempts
      FROM job_queue
      WHERE status='pending' AND run_after <= ?
      ORDER BY run_after ASC, id ASC
      LIMIT 1
    `).get(now)
    if (!job) return
    db.prepare(`
      UPDATE job_queue
      SET status='processing', attempts=attempts+1, updated_at=strftime('%s','now')
      WHERE id=?
    `).run(job.id)
  })
  claim.immediate()
  if (!job) return false

  const handler = handlers[job.type]
  if (!handler) {
    db.prepare(`
      UPDATE job_queue SET status='failed', last_error=?, updated_at=strftime('%s','now') WHERE id=?
    `).run(`No handler for type: ${job.type}`, job.id)
    logger.error('[Jobs] handler yok:', job.type)
    return true
  }

  let payload
  try { payload = JSON.parse(job.payload) }
  catch { payload = {} }

  try {
    await handler(payload)
    db.prepare(`
      UPDATE job_queue SET status='done', updated_at=strftime('%s','now'), last_error=NULL WHERE id=?
    `).run(job.id)
    return true
  } catch (err) {
    const attempts = job.attempts + 1
    const message = err?.message || String(err)
    if (err?.permanent) {
      // Kalici hata (orn. subscription gone) — is bitti say, retry yok.
      db.prepare(`
        UPDATE job_queue SET status='done', last_error=?, updated_at=strftime('%s','now') WHERE id=?
      `).run(message, job.id)
      return true
    }
    if (attempts >= job.max_attempts) {
      db.prepare(`
        UPDATE job_queue SET status='failed', last_error=?, updated_at=strftime('%s','now') WHERE id=?
      `).run(message, job.id)
      return true
    }
    // Exponential backoff: 30s * 2^attempts
    const backoff = 30 * Math.pow(2, attempts)
    db.prepare(`
      UPDATE job_queue SET status='pending', last_error=?, run_after=strftime('%s','now') + ?, updated_at=strftime('%s','now') WHERE id=?
    `).run(message, backoff, job.id)
    return true
  }
}

export function startWorker(opts = {}) {
  if (process.env.NODE_ENV === 'test') return
  if (process.env.JOB_WORKER_ENABLED === 'false') {
    logger.info('[Jobs] worker JOB_WORKER_ENABLED=false ile devre disi')
    return
  }
  if (workerTimer) return
  const intervalMs = Number(opts.intervalMs || process.env.JOB_WORKER_INTERVAL_MS || 2000)
  const loop = async () => {
    if (workerRunning) return
    workerRunning = true
    try {
      // Bir tick'te birden cok is varsa hepsini bos zamanda al
      while (await tickOnce()) { /* repeat */ }
    } catch (e) {
      logger.error('[Jobs] worker tick hatasi:', e)
    } finally {
      workerRunning = false
    }
  }
  workerTimer = setInterval(loop, intervalMs)
  logger.info({ intervalMs }, '[Jobs] worker basladi')
}

export function stopWorker() {
  if (workerTimer) {
    clearInterval(workerTimer)
    workerTimer = null
  }
}

export function getStats() {
  const db = getDB()
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM job_queue GROUP BY status").all()
  const out = { pending: 0, processing: 0, done: 0, failed: 0 }
  for (const r of rows) out[r.status] = r.n
  return out
}
