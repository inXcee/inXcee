import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDB, getDB } from '../db/index.js'
import { enqueue, tickOnce, getStats } from './index.js'
import { handlers } from './handlers.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  initDB()
})

beforeEach(() => {
  getDB().exec('DELETE FROM job_queue')
  for (const k of Object.keys(handlers)) delete handlers[k]
})

describe('enqueue', () => {
  it('inserts a pending job', () => {
    const id = enqueue('test.echo', { msg: 'hi' })
    expect(Number(id)).toBeGreaterThan(0)
    const row = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(0)
    expect(JSON.parse(row.payload)).toEqual({ msg: 'hi' })
  })

  it('honors runAfter option', () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    const id = enqueue('test.echo', {}, { runAfter: future })
    const row = getDB().prepare('SELECT run_after FROM job_queue WHERE id=?').get(id)
    expect(row.run_after).toBe(future)
  })
})

describe('tickOnce', () => {
  it('processes a pending job and marks done', async () => {
    handlers['test.echo'] = async (payload) => ({ echoed: payload.msg })
    const id = enqueue('test.echo', { msg: 'hello' })
    const processed = await tickOnce()
    expect(processed).toBe(true)
    const row = getDB().prepare('SELECT status FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('done')
  })

  it('returns false when no pending jobs', async () => {
    const processed = await tickOnce()
    expect(processed).toBe(false)
  })

  it('retries on handler error with backoff', async () => {
    handlers['test.fail'] = async () => { throw new Error('boom') }
    const id = enqueue('test.fail', {})
    await tickOnce()
    const row = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toContain('boom')
    expect(row.run_after).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('marks failed after max_attempts', async () => {
    handlers['test.fail'] = async () => { throw new Error('boom') }
    const id = enqueue('test.fail', {}, { maxAttempts: 2 })
    // Attempt 1 — run_after ileri kayar (status='pending', attempts=1)
    await tickOnce()
    // Attempt 2 icin run_after'i geri al, sonra tickOnce calistir
    getDB().prepare("UPDATE job_queue SET run_after=strftime('%s','now') WHERE id=?").run(id)
    await tickOnce()
    const row = getDB().prepare('SELECT status, attempts FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(2)
  })

  it('marks done permanently when err.permanent=true', async () => {
    handlers['test.permfail'] = async () => {
      const e = new Error('subscription gone')
      e.permanent = true
      throw e
    }
    const id = enqueue('test.permfail', {})
    await tickOnce()
    const row = getDB().prepare('SELECT status, attempts FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('done')
    expect(row.attempts).toBe(1)
  })

  it('marks failed if no handler registered', async () => {
    const id = enqueue('test.nohandler', {})
    await tickOnce()
    const row = getDB().prepare('SELECT status, last_error FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('failed')
    expect(row.last_error).toContain('No handler')
  })

  it('skips jobs with run_after in future', async () => {
    handlers['test.echo'] = async () => {}
    const future = Math.floor(Date.now() / 1000) + 3600
    enqueue('test.echo', {}, { runAfter: future })
    const processed = await tickOnce()
    expect(processed).toBe(false)
  })
})

describe('getStats', () => {
  it('returns counts by status', () => {
    enqueue('test.x', {})
    enqueue('test.x', {})
    const stats = getStats()
    expect(stats.pending).toBe(2)
    expect(stats.done).toBe(0)
  })
})
