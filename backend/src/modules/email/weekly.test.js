import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { buildWeeklyStats, buildWeeklyReportHtml, sendWeeklyReport } from './weekly.js'
import { setSetting } from './queries.js'

let managerToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token

  // Deterministik haftalık veri: son 7 gün içine giriş/çıkış + önceki haftaya kıyas verisi
  const db = getDB()
  db.prepare(`INSERT INTO personnel(full_name, created_at) VALUES ('Haftalık Test Sakini', datetime('now','-2 day'))`).run()
  const pid = db.prepare(`SELECT id FROM personnel WHERE full_name='Haftalık Test Sakini'`).get().id
  const room = db.prepare(`SELECT id FROM rooms LIMIT 1`).get()
  db.prepare(`INSERT INTO room_assignments(personnel_id, room_id, bed_no, assigned_at) VALUES (?, ?, 1, datetime('now','-2 day'))`).run(pid, room.id)
})

describe('buildWeeklyStats', () => {
  it('tarih aralığı + sayaçları döndürür', () => {
    const s = buildWeeklyStats()
    expect(s.range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(s.range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(s.range.start < s.range.end).toBe(true)
    expect(s.checkins).toBeGreaterThanOrEqual(1) // testte eklenen atama
    expect(s.newResidents).toBeGreaterThanOrEqual(1)
    expect(typeof s.checkouts).toBe('number')
    expect(typeof s.laundryDelivered).toBe('number')
    expect(typeof s.laundryNew).toBe('number')
    expect(typeof s.laundryLost).toBe('number')
    expect('laundryAvgHours' in s).toBe(true)
    expect(typeof s.visitors).toBe('number')
    expect(s.occupancy).toHaveProperty('totals')
    expect(s.maintenance).toHaveProperty('open')
    // önceki hafta kıyası
    expect(s.prev).toHaveProperty('checkins')
  })
})

describe('buildWeeklyReportHtml', () => {
  it('HAFTALIK başlığı + KPI değerleriyle HTML üretir', () => {
    const html = buildWeeklyReportHtml()
    expect(html).toContain('HAFTALIK')
    expect(html).toContain('Giriş')
    expect(html).toContain('Doluluk')
    expect(html).toContain('Yeni Torba')
    expect(html).toContain('Ort. Teslim Süresi')
    expect(html).toContain('<!DOCTYPE html>')
  })
})

describe('İmzalı föy bölümü', () => {
  const gun = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE') }
  let dept

  beforeAll(() => {
    const db = getDB()
    dept = Number(db.prepare("INSERT INTO departments(name, color_class) VALUES('Föy <Mail> Bölümü', 'blue')").run().lastInsertRowid)
    const s = Number(db.prepare('INSERT INTO staff(full_name, department_id, is_active) VALUES(?, ?, 1)').run('Mail Föy Kişisi', dept).lastInsertRowid)
    for (const n of [2, 3]) db.prepare("INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?, ?, 'scheduled')").run(s, gun(n))
  })

  it('hiç kontrol yokken tek satırlık hatırlatma gösterir', () => {
    const html = buildWeeklyReportHtml()
    expect(html).toContain('İmzalı Föy — Hafta')
    expect(html).toContain('hiç föy kontrolü yapılmadı')
  })

  it('kontrol varsa bölüm tablosu: gelmeyen gün sayısı, isim HTML-kaçışlı', () => {
    getDB().prepare(`INSERT INTO signature_check_runs(batch_id, work_date, department_id, warnings)
                     VALUES('mail-test', ?, ?, 1)`).run(gun(2), dept)
    const s = buildWeeklyStats().signature
    const d = s.departments.find(x => x.name === 'Föy <Mail> Bölümü')
    expect(d).toMatchObject({ expected: 2, checked: 1, missing: 1, warn: 1 })
    const html = buildWeeklyReportHtml()
    expect(html).toContain('Föy &lt;Mail&gt; Bölümü')
    expect(html).not.toContain('Föy <Mail> Bölümü')
    expect(html).toContain('Gelmeyen')
  })
})

describe('sendWeeklyReport', () => {
  it('email_enabled=false iken sessizce atlar (throw etmez)', async () => {
    setSetting('email_enabled', 'false')
    const r = await sendWeeklyReport()
    expect(r).toBeUndefined()
  })

  it('email_weekly=0 iken atlar', async () => {
    setSetting('email_enabled', 'true')
    setSetting('email_weekly', '0')
    const r = await sendWeeklyReport()
    expect(r).toBeUndefined()
    setSetting('email_weekly', '1')
    setSetting('email_enabled', 'false')
  })
})

describe('weekly routes', () => {
  it('GET /api/settings/email/weekly/preview HTML döndürür (admin)', async () => {
    const res = await request(app).get('/api/settings/email/weekly/preview')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('HAFTALIK')
  })

  it('GET /api/settings/email/weekly/preview token olmadan 401', async () => {
    const res = await request(app).get('/api/settings/email/weekly/preview')
    expect(res.status).toBe(401)
  })

  it('POST /api/settings/email/weekly/test SMTP yokken anlamlı hata döndürür', async () => {
    const res = await request(app).post('/api/settings/email/weekly/test')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
    expect(res.status).toBe(500)
    expect(res.body.error).toBeTruthy()
  })
})
