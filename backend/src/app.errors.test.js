import { describe, it, expect, beforeAll, vi } from 'vitest'
import { globalErrorHandler } from './app.js'
import { initDB, getDB } from './shared/db/index.js'

beforeAll(() => { process.env.DB_PATH = ':memory:'; initDB() })

function mockRes() {
  const res = { headersSent: false }
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}
const req = { method: 'DELETE', originalUrl: '/api/ornek/1', user: { id: 1 } }

describe('Global hata işleyici', () => {
  it('yabancı anahtar ihlali 500 değil, anlaşılır 409 döner', () => {
    const db = getDB()
    db.exec('CREATE TABLE fk_ana(id INTEGER PRIMARY KEY); CREATE TABLE fk_bagli(ana_id INTEGER REFERENCES fk_ana(id))')
    let err
    try { db.prepare('INSERT INTO fk_bagli(ana_id) VALUES (42)').run() } catch (e) { err = e }
    expect(err?.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY')

    const res = mockRes()
    globalErrorHandler(err, req, res, () => {})
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json.mock.calls[0][0].error).toMatch(/bağlı/)
  })

  it('beklenmeyen hata 500 döner ve iç mesajı sızdırmaz', () => {
    const res = mockRes()
    globalErrorHandler(new Error('SELECT gizli iç ayrıntı'), req, res, () => {})
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Sunucu hatası' })
  })

  it('istemci hatasının (4xx) mesajı aynen iletilir', () => {
    const res = mockRes()
    globalErrorHandler(Object.assign(new Error('Tarih YYYY-MM-DD olmalı'), { statusCode: 400 }), req, res, () => {})
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Tarih YYYY-MM-DD olmalı' })
  })
})
