// Rapor uçlarında KVKK erişim kuralı + girdi doğrulama + CSV güvenliği.
// Kural personel dosyasıyla aynıdır (personnel/access-policy.js): yalnız kampüs
// müdürü ham TC ve maaşı görür; vardiya amirine TC/pasaport maskeli, maaş hiç gitmez.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import app from '../../app.js'
import { csvSafe, parseMonth, toCsv } from './routes/shared.js'

const TC = '10000000146'
let mudur
let vardiya

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  db.prepare('INSERT INTO staff(full_name, tc_no, salary, is_active) VALUES(?,?,?,1)')
    .run('Rapor Gizlilik Personeli', TC, 45678)
  db.prepare('INSERT INTO personnel(tc_no, passport_no, full_name, company) VALUES(?,?,?,?)')
    .run(TC, 'U12345678', 'Rapor Gizlilik Sakini', 'TestCo')
  mudur = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  vardiya = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

const get = (url, token) => request(app).get(url).set('Authorization', `Bearer ${token}`)
const row = (rows, name) => rows.find(r => r.full_name === name)

describe('staff-builder — hassas alanlar', () => {
  it('müdür ham TC ve maaşı görür', async () => {
    const r = await get('/api/reports/staff-builder?cols=full_name,tc_no,salary', mudur)
    expect(r.status).toBe(200)
    const kisi = row(r.body.rows, 'Rapor Gizlilik Personeli')
    expect(kisi.tc_no).toBe(TC)
    expect(kisi.salary).toBe(45678)
    expect(r.body.available_columns).toContain('salary')
  })

  it('vardiya amiri TC maskeli görür, maaş kolonu hiç gelmez', async () => {
    const r = await get('/api/reports/staff-builder?cols=full_name,tc_no,salary', vardiya)
    expect(r.status).toBe(200)
    const kisi = row(r.body.rows, 'Rapor Gizlilik Personeli')
    expect(kisi.tc_no).not.toBe(TC)
    expect(kisi.tc_no).toMatch(/^100\*+46$/)
    expect(kisi).not.toHaveProperty('salary')
    expect(r.body.selected).toEqual(['full_name', 'tc_no'])
    expect(r.body.available_columns).not.toContain('salary')
  })

  it('izin listesinde olmayan kolon sessizce düşer', async () => {
    const r = await get('/api/reports/staff-builder?cols=full_name,password_hash', mudur)
    expect(r.status).toBe(200)
    expect(r.body.selected).toEqual(['full_name'])
    expect(r.body.rows[0]).not.toHaveProperty('password_hash')
  })
})

describe('cost-per-person — maaş ve ay doğrulama', () => {
  it('müdür maaşı görür', async () => {
    const r = await get('/api/reports/cost-per-person', mudur)
    expect(r.status).toBe(200)
    expect(row(r.body.rows, 'Rapor Gizlilik Personeli').salary).toBe(45678)
  })

  it('vardiya amirine maaş gitmez', async () => {
    const r = await get('/api/reports/cost-per-person', vardiya)
    expect(r.status).toBe(200)
    const kisi = row(r.body.rows, 'Rapor Gizlilik Personeli')
    expect(kisi).toBeDefined()
    expect(kisi).not.toHaveProperty('salary')
    expect(kisi).toHaveProperty('meal_cost')
  })

  it('geçerli ay kabul edilir ve yanıtta döner', async () => {
    const r = await get('/api/reports/cost-per-person?month=2026-02', mudur)
    expect(r.status).toBe(200)
    expect(r.body.month).toBe('2026-02')
  })

  it.each(['abc', '2026-13', '2026-1', "2026-01' OR 1=1"])('geçersiz ay %s → 400', async (m) => {
    const r = await get(`/api/reports/cost-per-person?month=${encodeURIComponent(m)}`, mudur)
    expect(r.status).toBe(400)
  })
})

describe('comparison — ay doğrulama', () => {
  it('önceki ayı yıl sınırında doğru hesaplar', async () => {
    const r = await get('/api/reports/comparison?month=2026-01', mudur)
    expect(r.status).toBe(200)
    expect(r.body.previous_month).toBe('2025-12')
  })

  it('geçersiz ay 400', async () => {
    const r = await get('/api/reports/comparison?month=bozuk', mudur)
    expect(r.status).toBe(400)
  })
})

describe('absence-dashboard — gün parametresi', () => {
  it('aralık dışı değer sınırlanır', async () => {
    expect((await get('/api/reports/absence-dashboard?days=9999', mudur)).body.days).toBe(365)
    expect((await get('/api/reports/absence-dashboard?days=-5', mudur)).body.days).toBe(1)
    expect((await get('/api/reports/absence-dashboard?days=abc', mudur)).body.days).toBe(30)
  })
})

describe('personel listesi — TC/pasaport maskesi', () => {
  it('müdür ham TC ve pasaportu görür (JSON + CSV)', async () => {
    const j = await get('/api/reports/personnel/data', mudur)
    expect(j.status).toBe(200)
    const kisi = row(j.body.rows, 'Rapor Gizlilik Sakini')
    expect(kisi.tc_no).toBe(TC)
    expect(kisi.passport_no).toBe('U12345678')
    const c = await get('/api/reports/personnel', mudur)
    expect(c.text).toContain(TC)
  })

  it('vardiya amiri maskeli görür (JSON + CSV)', async () => {
    const j = await get('/api/reports/personnel/data', vardiya)
    expect(j.status).toBe(200)
    const kisi = row(j.body.rows, 'Rapor Gizlilik Sakini')
    expect(kisi.tc_no).not.toBe(TC)
    expect(kisi.passport_no).not.toBe('U12345678')
    const c = await get('/api/reports/personnel', vardiya)
    expect(c.status).toBe(200)
    expect(c.text).toContain('Rapor Gizlilik Sakini')
    expect(c.text).not.toContain(TC)
    expect(c.text).not.toContain('U12345678')
  })
})

describe('CSV formül enjeksiyonu', () => {
  it('formülle başlayan metni etkisizleştirir', () => {
    expect(csvSafe('=HYPERLINK("http://x","tıkla")')).toBe('\'=HYPERLINK("http://x","tıkla")')
    expect(csvSafe('+cmd|calc')).toBe("'+cmd|calc")
    expect(csvSafe('-2+3+cmd')).toBe("'-2+3+cmd")
    expect(csvSafe('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('sayılara, telefonlara ve sıradan metne dokunmaz', () => {
    expect(csvSafe(-150)).toBe(-150)
    expect(csvSafe('-150,50')).toBe('-150,50')
    expect(csvSafe('+90 555 123 45 67')).toBe('+90 555 123 45 67')
    expect(csvSafe('Ahmet Yılmaz')).toBe('Ahmet Yılmaz')
    expect(csvSafe('-')).toBe('-')
    expect(csvSafe(null)).toBe(null)
  })

  it('toCsv çıktısında uygulanır', () => {
    const csv = toCsv(['Ad'], [['=1+1']])
    expect(csv).toContain("'=1+1")
  })

  it('personel CSV kötü niyetli adı etkisizleştirir', async () => {
    getDB().prepare('INSERT INTO personnel(full_name, company) VALUES(?,?)').run('=HYPERLINK("http://kotu")', 'X')
    const c = await get('/api/reports/personnel', mudur)
    expect(c.text).toContain('\'=HYPERLINK')
  })
})

describe('parseMonth', () => {
  it('boşsa varsayılanı, geçerliyse kendisini, değilse null döner', () => {
    expect(parseMonth(undefined, '2026-10')).toBe('2026-10')
    expect(parseMonth('', '2026-10')).toBe('2026-10')
    expect(parseMonth('2026-09', '2026-10')).toBe('2026-09')
    expect(parseMonth('2026-00', '2026-10')).toBe(null)
  })
})
