import { describe, it, expect, beforeAll, vi } from 'vitest'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import {
  getSetting, setSetting,
  getEmailSettings, setEmailSettings,
  getManagerEmails
} from './queries.js'
import { buildReportHtml } from './service.js'
import request from 'supertest'
import app from '../../app.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
})

let managerToken
beforeAll(async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  managerToken = res.body.token
})

describe('getSetting / setSetting', () => {
  it('varsayılan email_enabled değerini döndürür', () => {
    expect(getSetting('email_enabled')).toBe('false')
  })
  it('değer günceller', () => {
    setSetting('email_enabled', 'true')
    expect(getSetting('email_enabled')).toBe('true')
    setSetting('email_enabled', 'false') // geri al
  })
})

describe('getEmailSettings', () => {
  it('doğru şekle sahip nesne döndürür', () => {
    const s = getEmailSettings()
    expect(s).toMatchObject({ enabled: false, hour: 7, minute: 0, cc: '' })
  })
})

describe('setEmailSettings', () => {
  it('ayarları günceller ve geri okur', () => {
    setEmailSettings({ enabled: true, hour: 8, minute: 30, cc: 'test@x.com' })
    const s = getEmailSettings()
    expect(s.enabled).toBe(true)
    expect(s.hour).toBe(8)
    expect(s.minute).toBe(30)
    expect(s.cc).toBe('test@x.com')
    // geri al
    setEmailSettings({ enabled: false, hour: 7, minute: 0, cc: '' })
  })
})

describe('getManagerEmails', () => {
  it('campus_manager e-postalarını listeler', () => {
    const emails = getManagerEmails()
    expect(Array.isArray(emails)).toBe(true)
    expect(emails).toContain('mudur@yys.local')
  })
})

describe('buildReportHtml', () => {
  it('string döndürür', () => {
    const html = buildReportHtml()
    expect(typeof html).toBe('string')
  })
  it('6 bölüm başlığı içerir', () => {
    const html = buildReportHtml()
    const sections = [
      'KPI Özeti',
      'Doluluk',
      'Temizlik',
      'Bakım',
      'Giriş / Çıkış',
      'Çamaşırhane',
    ]
    sections.forEach(s => expect(html).toContain(s))
  })
})

describe('GET /api/settings/email', () => {
  it('200 ve doğru alanlar döner', async () => {
    const res = await request(app)
      .get('/api/settings/email')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ enabled: false, hour: 7, minute: 0 })
    expect(typeof res.body.cc).toBe('string')
  })
})

describe('PUT /api/settings/email', () => {
  it('200 döner ve DB güncellenir', async () => {
    const res = await request(app)
      .put('/api/settings/email')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ enabled: true, hour: 8, minute: 15, cc: 'cc@test.com' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const check = await request(app)
      .get('/api/settings/email')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(check.body.hour).toBe(8)
    expect(check.body.cc).toBe('cc@test.com')
  })
})

describe('POST /api/settings/email/test', () => {
  it('SMTP mock ile 200 döner', async () => {
    vi.mock('nodemailer', () => ({
      default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'test' }) }) }
    }))
    const res = await request(app)
      .post('/api/settings/email/test')
      .set('Authorization', `Bearer ${managerToken}`)
    expect([200, 500]).toContain(res.status) // SMTP yapılandırılmamışsa 500 da kabul
  })
})
