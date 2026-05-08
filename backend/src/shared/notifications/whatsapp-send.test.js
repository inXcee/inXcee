import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { initDB, getDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
})

beforeEach(() => {
  // Test arasinda env'i sifirla
  delete process.env.WHATSAPP_API_TOKEN
  delete process.env.WHATSAPP_PHONE_ID
  delete process.env.WHATSAPP_OUTBOUND
})

describe('normalizePhone', () => {
  it('cesitli formatlari E.164 (905...) formatina cevirir', async () => {
    const { normalizePhone } = await import('./whatsapp-send.js')
    expect(normalizePhone('+90 532 123 45 67')).toBe('905321234567')
    expect(normalizePhone('0532 123 45 67')).toBe('905321234567')
    expect(normalizePhone('5321234567')).toBe('905321234567')
    expect(normalizePhone('905321234567')).toBe('905321234567')
    expect(normalizePhone('00905321234567')).toBe('905321234567')
  })

  it('null/bos input null doner', async () => {
    const { normalizePhone } = await import('./whatsapp-send.js')
    expect(normalizePhone(null)).toBe(null)
    expect(normalizePhone('')).toBe(null)
    expect(normalizePhone('   ')).toBe(null)
  })
})

describe('sendWhatsAppText - konfigurasyon kontrolu', () => {
  it('env yoksa skipped doner ve log yazar', async () => {
    // Modul cache temizle ki env degisikligi gorulsun
    const { sendWhatsAppText, isWhatsAppConfigured } = await import('./whatsapp-send.js')
    expect(isWhatsAppConfigured()).toBe(false)
    const res = await sendWhatsAppText('5321234567', 'test')
    expect(res).toEqual({ sent: 0, skipped: 'not_configured' })

    const db = getDB()
    const log = db.prepare('SELECT * FROM whatsapp_outbound_log WHERE to_phone=?').get('905321234567')
    expect(log).toBeTruthy()
    expect(log.status).toBe('skipped_not_configured')
  })

  it('gecersiz telefon invalid_phone doner', async () => {
    const { sendWhatsAppText } = await import('./whatsapp-send.js')
    const res = await sendWhatsAppText('', 'test')
    expect(res).toEqual({ sent: 0, skipped: 'invalid_phone' })
  })
})

describe('sendWhatsAppToUser', () => {
  it('user.phone yoksa no_phone doner', async () => {
    const { sendWhatsAppToUser } = await import('./whatsapp-send.js')
    const db = getDB()
    const u = db.prepare("SELECT id FROM users WHERE username='mudur'").get()
    db.prepare('UPDATE users SET phone=NULL WHERE id=?').run(u.id)

    const res = await sendWhatsAppToUser(u.id, 'test')
    expect(res).toEqual({ sent: 0, skipped: 'no_phone' })
  })

  it('user.phone varsa normalize edip skip mesaji ile log yazar (env yok)', async () => {
    const { sendWhatsAppToUser } = await import('./whatsapp-send.js')
    const db = getDB()
    const u = db.prepare("SELECT id FROM users WHERE username='vardiya'").get()
    db.prepare('UPDATE users SET phone=? WHERE id=?').run('0533 999 88 77', u.id)

    const res = await sendWhatsAppToUser(u.id, 'kritik bildirim')
    expect(res).toEqual({ sent: 0, skipped: 'not_configured' })

    const log = db.prepare('SELECT * FROM whatsapp_outbound_log WHERE to_phone=?').get('905339998877')
    expect(log).toBeTruthy()
    expect(log.message).toBe('kritik bildirim')
  })
})

describe('isWhatsAppConfigured', () => {
  it('tum env varsa true doner', async () => {
    process.env.WHATSAPP_API_TOKEN = 'test-token'
    process.env.WHATSAPP_PHONE_ID = '12345'
    process.env.WHATSAPP_OUTBOUND = 'true'
    const { isWhatsAppConfigured } = await import('./whatsapp-send.js')
    expect(isWhatsAppConfigured()).toBe(true)
  })

  it('OUTBOUND=false ise false doner', async () => {
    process.env.WHATSAPP_API_TOKEN = 'test-token'
    process.env.WHATSAPP_PHONE_ID = '12345'
    process.env.WHATSAPP_OUTBOUND = 'false'
    const { isWhatsAppConfigured } = await import('./whatsapp-send.js')
    expect(isWhatsAppConfigured()).toBe(false)
  })
})

afterEach(() => {
  delete process.env.WHATSAPP_API_TOKEN
  delete process.env.WHATSAPP_PHONE_ID
  delete process.env.WHATSAPP_OUTBOUND
})
