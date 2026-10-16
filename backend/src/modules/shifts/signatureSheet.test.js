import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import {
  buildPlainWeeklyModel, mondayOf, PLAIN_ROWS_PER_PAGE, signatureSheetGroups, weekDates, weekLabel,
} from './signatureSheet.js'

// Gelecek hafta: plan yok → hücreler boş ve imzalanabilir. Bu hafta: OFF/izin işaretli, çalışma günü boş.
const PZT = '2027-03-01'
let token
let housekeeperToken
const id = {}
let kamp
let fpu

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const login = async (username) => (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token
  token = await login('mudur')
  housekeeperToken = await login('meydanci')
  const db = getDB()
  // seed'deki personel bu testin projelerine karışmasın
  db.prepare('UPDATE staff SET project_id = NULL, is_active = 0').run()
  kamp = db.prepare("SELECT id FROM projects WHERE code = 'KAMP'").get().id
  fpu = db.prepare("SELECT id FROM projects WHERE code = 'FPU'").get().id
  const dept = (name) => Number(db.prepare('INSERT INTO departments(name, color_class) VALUES(?, ?)').run(name, 'blue').lastInsertRowid)
  const kat = dept('KAT HİZMETLERİ SADE')
  const mutfak = dept('MUTFAK SADE')
  const staff = (name, { department = kat, project = kamp, order = null, active = 1, exit = null, hire = null } = {}) =>
    Number(db.prepare(`INSERT INTO staff(full_name, department_id, project_id, schedule_order, is_active, exit_date, hire_date)
      VALUES(?, ?, ?, ?, ?, ?, ?)`).run(name, department, project, order, active, exit, hire).lastInsertRowid)
  const plan = (staffId, date, status, leaveType = null) =>
    db.prepare('INSERT INTO shift_schedule(staff_id, dept_id, work_date, status, leave_type) VALUES(?, ?, ?, ?, ?)')
      .run(staffId, kat, date, status, leaveType)

  id.sef = staff('ZEYNEP ŞEF', { order: 1 })          // çizelge sırası adın önüne geçer
  id.ayse = staff('AYŞE KATÇI', { order: 5 })
  id.cem = staff('CEM KATÇI')
  id.asci = staff('BURAK AŞÇI', { department: mutfak, order: 3 })
  id.fpu = staff('FPU KİŞİSİ', { project: fpu })
  id.projesiz = staff('PROJESİZ KİŞİ', { project: null })
  id.bolumsuz = staff('BÖLÜMSÜZ KİŞİ', { department: null })
  id.ayrilan = staff('AYRILAN KİŞİ', { exit: '2027-02-26' })      // hafta başlamadan çıktı
  id.haftaIciAyrilan = staff('HAFTA İÇİ AYRILAN', { exit: '2027-03-03' })
  id.yeniGelen = staff('SONRA GELEN', { hire: '2027-03-10' })     // haftadan sonra işe girecek
  id.pasif = staff('PASİF KİŞİ', { active: 0 })

  plan(id.ayse, PZT, 'scheduled')
  plan(id.ayse, '2027-03-02', 'off')
  plan(id.ayse, '2027-03-03', 'on_leave', 'annual')
  plan(id.ayse, '2027-03-04', 'on_leave', 'sick')
  plan(id.ayse, '2027-03-05', 'absent')
})

describe('hafta yardımcıları', () => {
  it('pazartesiye çeker, 7 gün üretir, Türkçe etiket', () => {
    expect(mondayOf('2027-03-04')).toBe(PZT)
    expect(mondayOf('2027-03-07')).toBe(PZT)        // pazar → aynı haftanın pazartesisi
    expect(weekDates(PZT)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05', '2027-03-06', '2027-03-07'])
    expect(weekLabel(weekDates(PZT))).toBe('1–7 Mart 2027')
    expect(weekLabel(weekDates('2026-09-28'))).toBe('28 Eylül – 4 Ekim 2026')
    expect(weekLabel(weekDates('2026-12-28'))).toBe('28 Aralık 2026 – 3 Ocak 2027')
  })
})

describe('signatureSheetGroups', () => {
  it('proje sırasıyla, kimse kaybolmasın diye "proje atanmamış" sonda; boş grup yok', () => {
    const groups = signatureSheetGroups(PZT)
    expect(groups).toEqual([
      { key: String(fpu), name: 'FPU', people: 1 },
      { key: String(kamp), name: 'Kamp Alanı', people: 6 },
      { key: 'none', name: 'Proje atanmamış', people: 1 },
    ])
  })
})

describe('buildPlainWeeklyModel', () => {
  it('bölüm bandı altında çizelge sırası; görev sütunu yok; ayrılan/gelmeyen/pasif yok', () => {
    const { model, title } = buildPlainWeeklyModel({ weekStart: PZT, group: String(kamp) })
    expect(title).toBe('KAMP ALANI')
    expect(model.opts.showLocationAndRole).toBe(false)
    expect(model.opts.showDepartmentBands).toBe(true)
    const rows = model.pages.flatMap(p => p.rows)
    expect(rows.map(r => [r.department, r.full_name])).toEqual([
      ['KAT HİZMETLERİ SADE', 'ZEYNEP ŞEF'],
      ['KAT HİZMETLERİ SADE', 'AYŞE KATÇI'],
      ['KAT HİZMETLERİ SADE', 'CEM KATÇI'],
      ['KAT HİZMETLERİ SADE', 'HAFTA İÇİ AYRILAN'],
      ['MUTFAK SADE', 'BURAK AŞÇI'],
      ['BÖLÜMSÜZ', 'BÖLÜMSÜZ KİŞİ'],
    ])
    expect(model.people_count).toBe(6)
    expect(model.pages[0]).toMatchObject({
      department: 'KAMP ALANI', title: 'KAMP ALANI — HAFTALIK İMZA FÖYÜ', combined: true, page: 1, page_count: 1, people_total: 6,
    })
    expect(model.opts.shortDates).toBe(true)
  })

  it('hücre: çalışma ve plansız gün boş + imzalanır; OFF/izin/rapor/yok işaretli ve imza aranmaz', () => {
    const { model } = buildPlainWeeklyModel({ weekStart: PZT, group: String(kamp) })
    const ayse = model.pages[0].rows.find(r => r.staff_id === id.ayse)
    expect(ayse.days.map(d => [d.label, d.can_sign])).toEqual([
      ['', true], ['OFF', false], ['YILLIK İZİN', false], ['RAPORLU', false], ['YOK', false], ['', true], ['', true],
    ])
    expect(ayse.days.every(d => d.detail === '')).toBe(true)
  })

  it('sayfa başına 25 kişi; son sayfada boş satır', () => {
    const db = getDB()
    const kat = db.prepare("SELECT id FROM departments WHERE name = 'KAT HİZMETLERİ SADE'").get().id
    const ins = db.prepare('INSERT INTO staff(full_name, department_id, project_id, is_active) VALUES(?, ?, ?, 1)')
    for (let i = 0; i < 26; i += 1) ins.run(`FPU KALABALIK ${String(i).padStart(2, '0')}`, kat, fpu)
    const { model } = buildPlainWeeklyModel({ weekStart: PZT, group: String(fpu) })
    expect(model.pages.map(p => p.rows.length)).toEqual([PLAIN_ROWS_PER_PAGE, 2])
    expect(model.pages.map(p => [p.page, p.page_count, p.row_offset, p.show_blank_rows])).toEqual([[1, 2, 0, false], [2, 2, 25, true]])
    expect(model.pages[0].people_total).toBe(27)
    db.prepare("DELETE FROM staff WHERE full_name LIKE 'FPU KALABALIK %'").run()
  })

  it('proje atanmamış grup', () => {
    const { model, title } = buildPlainWeeklyModel({ weekStart: PZT, group: 'none' })
    expect(title).toBe('PROJE ATANMAMIŞ')
    expect(model.pages[0].rows.map(r => r.full_name)).toEqual(['PROJESİZ KİŞİ'])
  })
})

describe('POST /api/shifts/schedule/signature-sheet', () => {
  it('A3 köşe işaretli PDF + baskı kaydı (okuyucu yerleşimi buradan alır)', async () => {
    const res = await request(app).post('/api/shifts/schedule/signature-sheet')
      .set('Authorization', `Bearer ${token}`)
      .send({ week_start: '2027-03-03', group: String(kamp) })
      .buffer(true).parse((r, cb) => { const p = []; r.on('data', c => p.push(c)); r.on('end', () => cb(null, Buffer.concat(p))) })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('imza-foyu-kamp-alani-2027-03-01.pdf')
    const printId = Number(res.headers['x-signature-print-id'])
    expect(printId).toBeGreaterThan(0)
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')

    const rec = await request(app).get(`/api/shifts/schedule/signature-prints/${printId}`).set('Authorization', `Bearer ${token}`)
    expect(rec.status).toBe(200)
    expect(rec.body.week_start).toBe(PZT)
    expect(rec.body.layout.page.width).toBeCloseTo(1190.55, 1)          // A3 yatay
    expect(rec.body.layout.marker_pt).toBeGreaterThan(24)                // A3'te işaret büyür
    const roster = rec.body.layout.pages.filter(p => p.kind === 'roster')
    expect(roster).toHaveLength(1)                                        // sade föyde değişiklik sayfası yok
    expect(rec.body.layout.pages).toHaveLength(1)
    expect(roster[0].rows.filter(r => !r.blank).map(r => r.staff_id)).toContain(id.ayse)
  })

  it('gruplar ucu + geçersiz istekler + yetki', async () => {
    const g = await request(app).get('/api/shifts/schedule/signature-sheet/groups?week_start=2027-03-01')
      .set('Authorization', `Bearer ${token}`)
    expect(g.status).toBe(200)
    expect(g.body.week_start).toBe(PZT)
    expect(g.body.week_label).toBe('1–7 Mart 2027')
    expect(g.body.groups.map(x => x.key)).toEqual([String(fpu), String(kamp), 'none'])

    const auth = { Authorization: `Bearer ${token}` }
    expect((await request(app).post('/api/shifts/schedule/signature-sheet').set(auth).send({ week_start: '2027-13-01', group: 'none' })).status).toBe(400)
    expect((await request(app).post('/api/shifts/schedule/signature-sheet').set(auth).send({ week_start: PZT, group: 'x;1' })).status).toBe(400)
    expect((await request(app).post('/api/shifts/schedule/signature-sheet').set(auth).send({ week_start: PZT, group: '9999' })).status).toBe(404)
    expect((await request(app).post('/api/shifts/schedule/signature-sheet')
      .set('Authorization', `Bearer ${housekeeperToken}`).send({ week_start: PZT, group: 'none' })).status).toBe(403)
  })
})
