import { describe, it, expect, beforeAll, vi } from 'vitest'
import { globalErrorHandler } from './app.js'
import { initDB, getDB } from './shared/db/index.js'
import { logger } from './shared/logger.js'

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

  // İstemci hangi durumda olduğunu metinden değil koddan anlasın (ör. saha: kapıdaki QR'ı okut → kamera aç)
  it('istemci hatasının kodu varsa iletilir; sunucu hatasında kod sızmaz', () => {
    const res = mockRes()
    globalErrorHandler(Object.assign(new Error('x'), { statusCode: 409, code: 'qr_scan_required' }), req, res, () => {})
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ error: 'x', code: 'qr_scan_required' })
    const res500 = mockRes()
    globalErrorHandler(Object.assign(new Error('iç ayrıntı'), { code: 'ENOENT' }), req, res500, () => {})
    expect(res500.json).toHaveBeenCalledWith({ error: 'Sunucu hatası' })
  })

  it('istemci hatası uyarı seviyesinde ve yığın izisiz; sunucu hatası hata seviyesinde günlüğe düşer', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    try {
      globalErrorHandler(Object.assign(new Error('Hareket bulunamadı'), { statusCode: 404 }), req, mockRes(), () => {})
      expect(error).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        { status: 404, method: 'DELETE', url: '/api/ornek/1', msg: 'Hareket bulunamadı' }, '[Express] istemci hatası')
      globalErrorHandler(new Error('beklenmeyen'), req, mockRes(), () => {})
      expect(error).toHaveBeenCalledTimes(1)
      expect(error.mock.calls[0][0].err.message).toBe('beklenmeyen')
    } finally {
      warn.mockRestore()
      error.mockRestore()
    }
  })
})
