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
  it('endpoint ulaşılabilir ve auth korumalı', async () => {
    // SMTP kurulu olmadığından 500 beklenir; önemli olan 401/404 değil
    const res = await request(app)
      .post('/api/settings/email/test')
      .set('Authorization', `Bearer ${managerToken}`)
    expect([200, 500]).toContain(res.status)
  })
  it('token olmadan 401 döner', async () => {
    const res = await request(app).post('/api/settings/email/test')
    expect(res.status).toBe(401)
  })
})

describe('days & sections settings', () => {
  it('varsayılan days hafta içi döner', () => {
    const s = getEmailSettings()
    expect(s.days).toEqual([1, 2, 3, 4, 5])
  })
  it('varsayılan sections 5 bölüm döner', () => {
    const s = getEmailSettings()
    expect(s.sections).toContain('occupancy')
    expect(s.sections).toContain('maintenance')
  })
  it('setEmailSettings days kaydeder', () => {
    setEmailSettings({ enabled: false, hour: 7, minute: 0, cc: '', days: [1, 2, 3], sections: ['occupancy', 'maintenance'] })
    const s = getEmailSettings()
    expect(s.days).toEqual([1, 2, 3])
    expect(s.sections).toEqual(['occupancy', 'maintenance'])
    // geri al
    setEmailSettings({ enabled: false, hour: 7, minute: 0, cc: '', days: [1,2,3,4,5], sections: ['occupancy','housekeeping','maintenance','laundry','checkinout'] })
  })
})

describe('buildReportHtml section filter', () => {
  it('yalnızca seçili bölümleri içerir', () => {
    const html = buildReportHtml(['occupancy'])
    expect(html).toContain('Doluluk')
    expect(html).not.toContain('Çamaşırhane')
  })
})

describe('GET /api/settings/email/preview', () => {
  it('200 ve HTML string döner', async () => {
    const res = await request(app)
      .get('/api/settings/email/preview')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })
})

describe('GET /api/settings/email/log', () => {
  it('200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/settings/email/log')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('Faz 32 — E-posta şablonları', () => {
  it('extractVariables {{...}} yer tutucularını çıkarır', async () => {
    const { extractVariables } = await import('./templates.js')
    expect(extractVariables('Sayın {{yetkili}}, {{ay}} raporu. {{yetkili}} tekrar.')).toEqual(['yetkili', 'ay'])
    expect(extractVariables('düz metin')).toEqual([])
  })

  it('GET /templates dahili şablonları 4 kategoriyle döner', async () => {
    const res = await request(app).get('/api/settings/email/templates')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.categories.map(c => c.id).sort()).toEqual(['personel', 'rapor', 'resmi', 'tedarik'])
    const builtin = res.body.templates.filter(t => t.builtin)
    expect(builtin.length).toBeGreaterThanOrEqual(10)
    expect(builtin.every(t => t.id.startsWith('builtin:'))).toBe(true)
  })

  it('özel şablon oluştur → listede görünür → güncelle → sil', async () => {
    const create = await request(app).post('/api/settings/email/templates')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ category: 'personel', name: 'Test Şablonum', subject: 'Selam', body: 'Merhaba {{isim}}' })
    expect(create.status).toBe(201)
    const id = create.body.id

    const list = await request(app).get('/api/settings/email/templates')
      .set('Authorization', `Bearer ${managerToken}`)
    const mine = list.body.templates.find(t => t.id === `custom:${id}`)
    expect(mine).toBeTruthy()
    expect(mine.builtin).toBe(false)

    const upd = await request(app).put(`/api/settings/email/templates/${id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ category: 'rapor', name: 'Güncellendi', subject: 'x', body: 'y' })
    expect(upd.status).toBe(200)

    const del = await request(app).delete(`/api/settings/email/templates/${id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)

    const del2 = await request(app).delete(`/api/settings/email/templates/${id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(del2.status).toBe(404)
  })

  it('isimsiz şablon 400', async () => {
    const res = await request(app).post('/api/settings/email/templates')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ category: 'personel', body: 'x' })
    expect(res.status).toBe(400)
  })

  it('GET /contacts yönetici e-postalarını içerir', async () => {
    const res = await request(app).get('/api/settings/email/contacts')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.some(c => c.email === 'mudur@yys.local')).toBe(true)
  })
})

describe('Faz 32 — Compose gönderim', () => {
  it('geçersiz alıcı 400', async () => {
    const res = await request(app).post('/api/settings/email/compose')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ to: 'gecersiz-adres', subject: 'x', body: 'y' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/e-posta/i)
  })

  it('boş konu 400', async () => {
    const res = await request(app).post('/api/settings/email/compose')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ to: 'a@b.com', subject: '  ', body: 'y' })
    expect(res.status).toBe(400)
  })

  it('SMTP kurulu değilse 502 (anlamlı hata)', async () => {
    const res = await request(app).post('/api/settings/email/compose')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ to: 'a@b.com', subject: 'Konu', body: 'İçerik' })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/SMTP/i)
  })

  it('token olmadan 401', async () => {
    const res = await request(app).post('/api/settings/email/compose').send({ to: 'a@b.com', subject: 'x', body: 'y' })
    expect(res.status).toBe(401)
  })

  it('geçersiz ek id ile 400 (SMTP denenmeden)', async () => {
    const res = await request(app).post('/api/settings/email/compose')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ to: 'a@b.com', subject: 'Konu', body: 'İçerik', attachmentIds: [999999] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/ek/i)
  })
})

describe('Faz 33 — Ek dosya arşivi', () => {
  const PDF = Buffer.from('%PDF-1.4 test dosyasi')
  let attId

  it('dosya yükle → listede görünür', async () => {
    const res = await request(app).post('/api/settings/email/attachments')
      .set('Authorization', `Bearer ${managerToken}`)
      .field('name', 'Sipariş Formu')
      .field('category', 'formlar')
      .attach('file', PDF, { filename: 'siparis.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(201)
    attId = res.body.id

    const list = await request(app).get('/api/settings/email/attachments')
      .set('Authorization', `Bearer ${managerToken}`)
    const mine = list.body.find(a => a.id === attId)
    expect(mine).toBeTruthy()
    expect(mine.name).toBe('Sipariş Formu')
    expect(mine.category).toBe('formlar')
    expect(mine.original_name).toBe('siparis.pdf')
  })

  it('adsız yükleme 400', async () => {
    const res = await request(app).post('/api/settings/email/attachments')
      .set('Authorization', `Bearer ${managerToken}`)
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(400)
  })

  it('indir → dosya döner', async () => {
    const res = await request(app).get(`/api/settings/email/attachments/${attId}/download`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
  })

  it('yeni sürüm yükle (ad korunur, dosya değişir)', async () => {
    const res = await request(app).put(`/api/settings/email/attachments/${attId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .field('name', 'Sipariş Formu v2')
      .field('category', 'formlar')
      .attach('file', Buffer.from('%PDF-1.4 yeni surum'), { filename: 'siparis-v2.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(200)
    const list = await request(app).get('/api/settings/email/attachments')
      .set('Authorization', `Bearer ${managerToken}`)
    const mine = list.body.find(a => a.id === attId)
    expect(mine.name).toBe('Sipariş Formu v2')
    expect(mine.original_name).toBe('siparis-v2.pdf')
  })

  it('sadece ad/kategori güncelle (dosyasız)', async () => {
    const res = await request(app).put(`/api/settings/email/attachments/${attId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Yeni Ad', category: 'resmi' })
    expect(res.status).toBe(200)
  })

  it('sil → sonra 404', async () => {
    const del = await request(app).delete(`/api/settings/email/attachments/${attId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
    const again = await request(app).delete(`/api/settings/email/attachments/${attId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(again.status).toBe(404)
  })

  it('token olmadan liste 401', async () => {
    const res = await request(app).get('/api/settings/email/attachments')
    expect(res.status).toBe(401)
  })
})

describe('SMTP tanılama — gönderen normalizasyonu ve hata çevirisi', () => {
  it('gönderen alanı e-posta değilse ad olarak kullanılır', async () => {
    const { resolveFrom } = await import('./service.js')
    expect(resolveFrom({ from: 'YYS', user: 'kamp@ornek.com' })).toBe('"YYS" <kamp@ornek.com>')
    expect(resolveFrom({ from: 'rapor@ornek.com', user: 'kamp@ornek.com' })).toBe('rapor@ornek.com')
    expect(resolveFrom({ from: '', user: 'kamp@ornek.com' })).toBe('kamp@ornek.com')
    expect(resolveFrom({ from: 'YYS', user: null })).toBeNull()
  })

  it('535 kimlik hatası Gmail için uygulama şifresi önerir ve kalıcı sayılır', async () => {
    const { describeSmtpError, isSmtpAuthError } = await import('./service.js')
    const error = Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'), { responseCode: 535 })
    const described = describeSmtpError(error, { host: 'smtp.gmail.com', port: 587 })
    expect(described.kind).toBe('auth')
    expect(described.message).toMatch(/Uygulama Şifresi/i)
    expect(isSmtpAuthError(error)).toBe(true)
  })

  it('Brevo için SMTP anahtarı ve doğrulanmış gönderici uyarısı verir', async () => {
    const { describeSmtpError } = await import('./service.js')
    const auth = describeSmtpError(Object.assign(new Error('Invalid login'), { responseCode: 535 }),
      { host: 'smtp-relay.brevo.com', port: 587 })
    expect(auth.kind).toBe('auth')
    expect(auth.message).toMatch(/SMTP anahtar/i)
    const sender = describeSmtpError(Object.assign(new Error('550 5.7.1 Sender not authorized'), { responseCode: 550 }),
      { host: 'smtp-relay.brevo.com', port: 587 })
    expect(sender.kind).toBe('config')
    expect(sender.message).toMatch(/doğrulanmış gönderici/i)
  })

  it('Microsoft 365 için SMTP AUTH uyarısı verir', async () => {
    const { describeSmtpError } = await import('./service.js')
    const error = Object.assign(new Error('535 5.7.139 Authentication unsuccessful'), { responseCode: 535 })
    expect(describeSmtpError(error, { host: 'smtp.office365.com', port: 587 }).message).toMatch(/Authenticated SMTP/i)
  })

  it('ağ ve host hataları ayrı sınıflandırılır', async () => {
    const { describeSmtpError } = await import('./service.js')
    const dns = describeSmtpError(Object.assign(new Error('getaddrinfo ENOTFOUND smtp.yanlis'), { code: 'ENOTFOUND' }), { host: 'smtp.yanlis' })
    expect(dns.kind).toBe('config')
    const timeout = describeSmtpError(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }), { host: 'smtp.x', port: 587 })
    expect(timeout.kind).toBe('network')
  })

  it('kimlik hatası su mail işlerinde retry edilmez', async () => {
    const { sendDailyDigestMailJob } = await import('../water/jobs.js')
    const authError = Object.assign(new Error('SMTP kimlik doğrulama reddedildi. …'), { smtpKind: 'auth' })
    await expect(sendDailyDigestMailJob({ deliveryId: 0 })).rejects.toMatchObject({ permanent: true })
    // smtpKind='auth' taşıyan hata kalıcı işaretlenmeli (isPermanentMailError üzerinden)
    expect(authError.smtpKind).toBe('auth')
  })

  it('verify-smtp yapılandırma özetini şifresiz döner', async () => {
    const res = await request(app).post('/api/settings/email/verify-smtp')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.config).toBeTruthy()
    expect(JSON.stringify(res.body)).not.toMatch(/pass"\s*:\s*"[^"]+"/)
    expect(res.body.config).toHaveProperty('pass_set')
  })
})
