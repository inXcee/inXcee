import { describe, it, expect, beforeAll } from 'vitest'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import {
  getSetting, setSetting,
  getEmailSettings, setEmailSettings,
  getManagerEmails
} from './queries.js'
import { buildReportHtml } from './service.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
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
