import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { checkSignatureSheet, classifyScheduleCell, judgeRow } from './signatureCheck.js'

const GUN = '2026-10-07'
const GUN2 = '2026-10-08'
let token
let housekeeperToken
let dept
let otherDept
const id = {}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const login = async (username) => (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token
  token = await login('mudur')
  housekeeperToken = await login('meydanci')
  const db = getDB()
  dept = Number(db.prepare("INSERT INTO departments(name, color_class) VALUES('Föy Test Bölümü', 'blue')").run().lastInsertRowid)
  otherDept = Number(db.prepare("INSERT INTO departments(name, color_class) VALUES('Föy Diğer Bölüm', 'red')").run().lastInsertRowid)
  const staff = (name, department = dept, active = 1) =>
    Number(db.prepare('INSERT INTO staff(full_name, department_id, is_active) VALUES(?, ?, ?)').run(name, department, active).lastInsertRowid)
  const plan = (staffId, date, status, leaveType = null) =>
    db.prepare('INSERT INTO shift_schedule(staff_id, dept_id, work_date, status, leave_type) VALUES(?, ?, ?, ?, ?)')
      .run(staffId, dept, date, status, leaveType)

  id.calisan = staff('AYŞE FÖYDEMİR'); plan(id.calisan, GUN, 'scheduled')
  id.imzasiz = staff('Mehmet Föyimzasız'); plan(id.imzasiz, GUN, 'scheduled')
  id.off = staff('Ali Föyoff'); plan(id.off, GUN, 'off')
  id.rapor = staff('Fatma Föyrapor'); plan(id.rapor, GUN, 'on_leave', 'sick')
  id.yillik = staff('Can Föyyıllık'); plan(id.yillik, GUN, 'on_leave', 'annual')
  id.offImzali = staff('Zeynep Föyoffimzalı'); plan(id.offImzali, GUN, 'off')
  id.raporYazili = staff('Hasan Föyraporyazılı'); plan(id.raporYazili, GUN, 'scheduled')
  id.plansiz = staff('Elif Föyplansız')
  id.foydeYok = staff('Burak Föydeyok'); plan(id.foydeYok, GUN, 'scheduled')
  id.digerBolum = staff('Deniz Föydiğer', otherDept); plan(id.digerBolum, GUN, 'scheduled')
  id.pasif = staff('Selin Föypasif', dept, 0); plan(id.pasif, GUN, 'scheduled')
  id.ikiz1 = staff('Ahmet Föyikiz'); id.ikiz2 = staff('Ahmet Föyikiz')
  plan(id.calisan, GUN2, 'worked')
})

describe('classifyScheduleCell / judgeRow', () => {
  it('frontend imza föyü sınıflamasıyla aynı kategoriler', () => {
    expect(classifyScheduleCell(null)).toBe('unplanned')
    expect(classifyScheduleCell({ status: 'overtime' })).toBe('working')
    expect(classifyScheduleCell({ status: 'on_leave', leave_type: 'sick' })).toBe('report')
    expect(classifyScheduleCell({ status: 'on_leave', leave_type: 'unpaid' })).toBe('other_leave')
  })

  it('"İZİN" notu yıllık ve diğer izinle uyumlu, rapor ile değil', () => {
    expect(judgeRow('leave', 'annual').verdict).toBe('ok_mark_matches')
    expect(judgeRow('leave', 'other_leave').verdict).toBe('ok_mark_matches')
    expect(judgeRow('leave', 'report').verdict).toBe('mark_mismatch')
  })
})

describe('checkSignatureSheet', () => {
  const rows = () => [
    { name: 'ayşe föydemir', date: GUN, mark: 'signed' },          // büyük/küçük harf + Türkçe
    { name: 'MEHMET FOYIMZASIZ', date: GUN, mark: 'blank' },        // aksansız yazılmış
    { staff_id: id.off, date: GUN, mark: 'blank' },
    { name: 'Fatma Föyrapor', date: GUN, mark: 'report' },
    { name: 'Can Föyyıllık', date: GUN, mark: 'leave' },
    { name: 'Zeynep Föyoffimzalı', date: GUN, mark: 'signed' },
    { name: 'Hasan Föyraporyazılı', date: GUN, mark: 'report', note: 'kenarda RAPOR yazıyor' },
    { name: 'Elif Föyplansız', date: GUN, mark: 'signed' },
    { name: 'Ahmet Föyikiz', date: GUN, mark: 'signed' },
    { name: 'Olmayan Kişi', date: GUN, mark: 'signed' },
    { name: 'Ayşe Föydemir', date: GUN, mark: 'signed' },           // mükerrer satır
    { name: 'Ayşe Föydemir', date: GUN2, mark: 'blank' },
  ]

  it('kişi kişi doğru hüküm verir', () => {
    const r = checkSignatureSheet({ rows: rows() })
    const by = (sid, date = GUN) => r.items.find(i => i.staff_id === sid && i.date === date)
    expect(by(id.calisan).verdict).toBe('ok')
    expect(by(id.imzasiz).verdict).toBe('missing_signature')
    expect(by(id.off).verdict).toBe('ok_not_working')
    expect(by(id.rapor).verdict).toBe('ok_mark_matches')
    expect(by(id.yillik).verdict).toBe('ok_mark_matches')
    expect(by(id.offImzali).verdict).toBe('signed_not_working')
    expect(by(id.raporYazili)).toMatchObject({ verdict: 'mark_mismatch', planned: 'working', note: 'kenarda RAPOR yazıyor' })
    expect(by(id.plansiz).verdict).toBe('signed_unplanned')
    expect(by(id.calisan, GUN2).verdict).toBe('missing_signature')
  })

  it('eşleşmeyen, belirsiz ve mükerrer satırları ayrı raporlar — tahmin yürütmez', () => {
    const r = checkSignatureSheet({ rows: rows() })
    const ikiz = r.unmatched.find(u => u.name === 'Ahmet Föyikiz')
    expect(ikiz.candidates.map(c => c.id).sort()).toEqual([id.ikiz1, id.ikiz2].sort())
    expect(r.unmatched.find(u => u.name === 'Olmayan Kişi').reason).toMatch(/bulunamadı/)
    expect(r.duplicates).toHaveLength(1)
    expect(r.summary.unmatched).toBe(2)
  })

  it('föyde hiç olmayan ama çalışan aktif kişiyi yalnız föydeki bölümlerden bulur', () => {
    const r = checkSignatureSheet({ rows: rows() })
    const ids = r.not_on_sheet.map(n => n.staff_id)
    expect(ids).toContain(id.foydeYok)
    expect(ids).not.toContain(id.digerBolum)
    expect(ids).not.toContain(id.pasif)
    expect(r.summary.not_on_sheet).toBe(r.not_on_sheet.length)
  })

  it('soyad-önce yazılmış ismi kesin eşleştirir ve bunu belirtir', () => {
    const r = checkSignatureSheet({ rows: [{ name: 'FÖYDEMİR AYŞE', date: GUN, mark: 'signed' }] })
    expect(r.items[0]).toMatchObject({ staff_id: id.calisan, verdict: 'ok', matched_by: 'word_order', sheet_name: 'FÖYDEMİR AYŞE' })
    expect(r.unmatched).toHaveLength(0)
  })

  it('yazım hatalı isim eşleşmez, yalnız öneri döner', () => {
    const r = checkSignatureSheet({ rows: [
      { name: 'Mehmet Föyimzasz', date: GUN, mark: 'blank' },   // harf eksik
      { name: 'Föyimzasız Mehmt', date: GUN, mark: 'blank' },   // ters sıra + harf eksik
      { name: 'Tamamen Başka', date: GUN, mark: 'signed' },
    ] })
    expect(r.items).toHaveLength(0)
    expect(r.unmatched[0].suggestions[0]).toMatchObject({ id: id.imzasiz, full_name: 'Mehmet Föyimzasız' })
    expect(r.unmatched[1].suggestions[0].id).toBe(id.imzasiz)
    expect(r.unmatched[2].suggestions).toEqual([])
  })

  it('öneride aktif personel pasiften önce gelir', () => {
    const r = checkSignatureSheet({ rows: [{ name: 'Selin Föypasf', date: GUN, mark: 'signed' }] })
    const s = r.unmatched[0].suggestions.find(x => x.id === id.pasif)
    expect(s).toMatchObject({ is_active: false })
  })

  it('salt okuma: shift_schedule değişmez', () => {
    const db = getDB()
    const before = db.prepare('SELECT COUNT(*) c, group_concat(status) s FROM shift_schedule').get()
    checkSignatureSheet({ rows: rows() })
    expect(db.prepare('SELECT COUNT(*) c, group_concat(status) s FROM shift_schedule').get()).toEqual(before)
  })
})

describe('POST /api/shifts/schedule/signature-check', () => {
  it('müdür raporu alır', async () => {
    const res = await request(app).post('/api/shifts/schedule/signature-check')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ name: 'Mehmet Föyimzasız', date: GUN, mark: 'blank' }], department_id: dept })
    expect(res.status).toBe(200)
    expect(res.body.summary.missing_signature).toBe(1)
    expect(res.body.items[0].text).toMatch(/imza yok/)
  })

  it('geçersiz işaret ve isimsiz satır 400', async () => {
    const send = (rows) => request(app).post('/api/shifts/schedule/signature-check')
      .set('Authorization', `Bearer ${token}`).send({ rows })
    expect((await send([{ name: 'X', date: GUN, mark: 'belki' }])).status).toBe(400)
    expect((await send([{ date: GUN, mark: 'signed' }])).status).toBe(400)
    expect((await send([{ name: 'X', date: '07.10.2026', mark: 'signed' }])).status).toBe(400)
  })

  it('yetkisiz rol 403', async () => {
    const res = await request(app).post('/api/shifts/schedule/signature-check')
      .set('Authorization', `Bearer ${housekeeperToken}`)
      .send({ rows: [{ name: 'X', date: GUN, mark: 'signed' }] })
    expect(res.status).toBe(403)
  })
})
