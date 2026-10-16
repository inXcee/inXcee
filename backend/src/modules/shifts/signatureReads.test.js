import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { istanbulDate } from '../../shared/time.js'
import { buildSignatureCoverage, cellStatus } from './signatureCheckRuns.js'
import { mondayOf, weekDates } from './signatureSheet.js'

// 30 kişilik tek bölüm → sade föy 2 sayfa (25 + 5). Sayfalar ayrı ayrı okunur; föy takibi ikinciyle EZİLMEMELİ.
const PZT = '2027-03-01'
const GUNLER = weekDates(PZT)
let token
let kamp
let fpu
let kat
const staff = []

const auth = () => ({ Authorization: `Bearer ${token}` })

async function printSheet(group, week = PZT) {
  const res = await request(app).post('/api/shifts/schedule/signature-sheet').set(auth())
    .send({ week_start: week, group: String(group) })
    .buffer(true).parse((r, cb) => { const p = []; r.on('data', c => p.push(c)); r.on('end', () => cb(null, Buffer.concat(p))) })
  expect(res.status).toBe(200)
  const id = Number(res.headers['x-signature-print-id'])
  const rec = await request(app).get(`/api/shifts/schedule/signature-prints/${id}`).set(auth())
  return { id, layout: rec.body.layout }
}

const pageStaff = (layout, index) =>
  layout.pages.find(p => p.index === index).rows.filter(r => !r.blank).map(r => r.staff_id)

// Bir sayfanın tüm kişileri × günleri: varsayılan imzalı; istisnalar boş
const pageRows = (ids, blank = new Set(), days = GUNLER) => ids.flatMap(id => days.slice(0, 5).map(date =>
  ({ staff_id: id, date, mark: blank.has(`${id}|${date}`) ? 'blank' : 'signed' })))

const latestRun = (date, dept) => getDB().prepare(`SELECT * FROM signature_check_runs WHERE work_date = ? AND department_id = ?
  ORDER BY id DESC LIMIT 1`).get(date, dept)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  db.prepare('UPDATE staff SET project_id = NULL, is_active = 0').run()
  kamp = db.prepare("SELECT id FROM projects WHERE code = 'KAMP'").get().id
  fpu = db.prepare("SELECT id FROM projects WHERE code = 'FPU'").get().id
  kat = Number(db.prepare("INSERT INTO departments(name, color_class) VALUES('KAT OKUMA TEST', 'blue')").run().lastInsertRowid)
  const ins = db.prepare('INSERT INTO staff(full_name, department_id, project_id, is_active, schedule_order) VALUES(?, ?, ?, 1, ?)')
  const plan = db.prepare("INSERT INTO shift_schedule(staff_id, dept_id, work_date, status) VALUES(?, ?, ?, 'scheduled')")
  for (let i = 0; i < 30; i += 1) {
    const id = Number(ins.run(`OKUMA KİŞİ ${String(i).padStart(2, '0')}`, kat, kamp, i + 1).lastInsertRowid)
    staff.push(id)
    for (const d of GUNLER.slice(0, 5)) plan.run(id, kat, d)
  }
  ins.run('FPU OKUMA KİŞİSİ', kat, fpu, 99)
})

describe('cellStatus — haftalık föy', () => {
  const weekly = (pages, due = '2027-03-08') => ({ due, pages })
  it('hafta bitmeden okunmamış gün "bekleniyor", föyün son günü geçince "gelmedi"', () => {
    expect(cellStatus({ planned: 3, run: null, date: '2027-03-01', today: '2027-03-05', weekly: weekly([{ read: false }]) })).toBe('pending')
    expect(cellStatus({ planned: 3, run: null, date: '2027-03-01', today: '2027-03-08', weekly: weekly([{ read: false }]) })).toBe('pending')
    expect(cellStatus({ planned: 3, run: null, date: '2027-03-01', today: '2027-03-09', weekly: weekly([{ read: false }]) })).toBe('missing')
    // günlük föy (haftalık baskı yok): eskisi gibi ertesi gün gelmedi
    expect(cellStatus({ planned: 3, run: null, date: '2027-03-01', today: '2027-03-02' })).toBe('missing')
  })

  it('bölüm iki sayfada, yalnız biri o günü kapsıyorsa "kısmen" (uyarı varsa uyarı öne çıkar)', () => {
    const pages = [{ read: true, photo_day: '2027-03-08' }, { read: false }]
    expect(cellStatus({ planned: 3, run: { warnings: 0 }, date: '2027-03-01', today: '2027-03-05', weekly: weekly(pages) })).toBe('partial')
    expect(cellStatus({ planned: 3, run: { warnings: 2 }, date: '2027-03-01', today: '2027-03-05', weekly: weekly(pages) })).toBe('warn')
  })

  it('sayfa, fotoğraf gününden SONRAKİ günleri kapsamaz', () => {
    const pages = [{ read: true, photo_day: '2027-03-03' }]
    expect(cellStatus({ planned: 3, run: { warnings: 0 }, date: '2027-03-02', today: '2027-03-05', weekly: weekly(pages) })).toBe('clean')
    expect(cellStatus({ planned: 3, run: null, date: '2027-03-03', today: '2027-03-05', weekly: weekly(pages) })).toBe('pending')
  })
})

describe('föy sayfa okuması — haftalık birleşim', () => {
  let print
  let read1

  it('ilk sayfa: kaydedilir, kontrol bu sayfayı kapsar, ilerleme 1/2', async () => {
    print = await printSheet(kamp)
    const roster = print.layout.pages.filter(p => p.kind === 'roster')
    expect(roster).toHaveLength(2)
    const ids = pageStaff(print.layout, 0)
    expect(ids).toHaveLength(25)
    const res = await request(app).post(`/api/shifts/schedule/signature-prints/${print.id}/reads`).set(auth())
      .send({ page: 0, rows: pageRows(ids, new Set([`${ids[0]}|${PZT}`])), photo_day: '2027-03-08', stats: { signed: 124, blank: 1 } })
    expect(res.status).toBe(200)
    read1 = res.body.read_id
    expect(res.body.week_start).toBe(PZT)
    expect(res.body.check.summary.missing_signature).toBe(1)
    const kampProgress = res.body.progress.find(p => p.print_id === print.id)
    expect(kampProgress).toMatchObject({ title: 'KAMP ALANI', group_key: String(kamp), total: 2, read: 1, missing: [2] })
    // bölümün diğer sayfası okunmadı → o gün "kısmen"
    const cov = buildSignatureCoverage({ from: PZT, to: GUNLER[6] })
    const katRow = cov.departments.find(d => d.id === kat)
    expect(katRow.cells[PZT]).toMatchObject({ status: 'warn', sheet_pages: 2, sheet_pages_covering: 1 })
    expect(katRow.cells[GUNLER[1]].status).toBe('partial')
  })

  it('ikinci sayfa ilkini EZMEZ: föy takibi iki sayfanın birleşimi', async () => {
    const ids = pageStaff(print.layout, 1)
    expect(ids).toHaveLength(5)
    const res = await request(app).post(`/api/shifts/schedule/signature-prints/${print.id}/reads`).set(auth())
      .send({ page: 1, rows: pageRows(ids), photo_day: '2027-03-08' })
    expect(res.status).toBe(200)
    expect(res.body.progress.find(p => p.print_id === print.id)).toMatchObject({ read: 2, missing: [] })
    const run = latestRun(PZT, kat)
    expect(run.rows_count).toBe(30)            // eskiden yalnız son sayfa: 5
    expect(run.missing_signature).toBe(1)      // ilk sayfadaki eksik imza kaybolmadı
    const cov = buildSignatureCoverage({ from: PZT, to: GUNLER[6] })
    expect(cov.departments.find(d => d.id === kat).cells[GUNLER[1]].status).toBe('clean')
    expect(cov.prints.find(p => p.print_id === print.id)).toMatchObject({ read: 2, week_start: PZT })
  })

  it('belirsiz/yanlış hücre elle düzeltilir, kontrol yeniden yapılır', async () => {
    const res = await request(app).patch(`/api/shifts/schedule/signature-reads/${read1}`).set(auth())
      .send({ corrections: [{ staff_id: staff[0], date: PZT, mark: 'signed' }] })
    expect(res.status).toBe(200)
    expect(latestRun(PZT, kat).missing_signature).toBe(0)
    expect(res.body.check.summary.missing_signature).toBe(0)
  })

  it('aynı sayfanın yeni fotoğrafı eskisinin yerine geçer', async () => {
    const ids = pageStaff(print.layout, 1)
    const res = await request(app).post(`/api/shifts/schedule/signature-prints/${print.id}/reads`).set(auth())
      .send({ page: 1, rows: pageRows(ids, new Set([`${ids[0]}|${GUNLER[2]}`])), photo_day: '2027-03-08' })
    expect(res.status).toBe(200)
    expect(latestRun(GUNLER[2], kat).missing_signature).toBe(1)
    expect(latestRun(GUNLER[2], kat).rows_count).toBe(30)
  })

  it('geçersiz okuma reddedilir', async () => {
    const other = pageStaff(print.layout, 1)[0]
    const post = (id, body) => request(app).post(`/api/shifts/schedule/signature-prints/${id}/reads`).set(auth()).send(body)
    expect((await post(print.id, { page: 0, rows: [{ staff_id: other, date: PZT, mark: 'signed' }] })).status).toBe(400)  // o sayfada değil
    expect((await post(print.id, { page: 0, rows: [{ staff_id: staff[0], date: '2027-03-20', mark: 'signed' }] })).status).toBe(400)
    expect((await post(print.id, { page: 7, rows: [] })).status).toBe(400)
    expect((await post(999999, { page: 0, rows: [] })).status).toBe(404)
    expect((await post(print.id, { page: 0, rows: [{ staff_id: staff[0], date: PZT, mark: 'off' }] })).status).toBe(400)
    expect((await request(app).patch('/api/shifts/schedule/signature-reads/999999').set(auth())
      .send({ corrections: [{ staff_id: staff[0], date: PZT, mark: 'signed' }] })).status).toBe(404)
  })
})

describe('migration 123 — önceden basılmış sade föylere grup', () => {
  it('A3 + görev sütunsuz baskı: başlıktan proje (Türkçe büyük harf) ya da "none"; web baskısına dokunmaz', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sql = fs.readFileSync(path.resolve('src/shared/db/migrations/123_signature_sheet_reads.sql'), 'utf8')
    const backfill = sql.slice(sql.indexOf('UPDATE signature_sheet_prints'))
    const db = getDB()
    const add = (dept, width, roleW) => Number(db.prepare(`INSERT INTO signature_sheet_prints(week_start, dates_json, layout_json, page_count)
      VALUES('2026-10-19', '[]', ?, 1)`).run(JSON.stringify({ page: { width }, table: { role_w: roleW },
      pages: [{ index: 0, kind: 'roster', department: dept, rows: [] }] })).lastInsertRowid)
    const ids = [add('KAMP ALANI', 1190.55, 0), add('FPU', 1190.55, 0), add('PROJE ATANMAMIŞ', 1190.55, 0), add('Mutfak', 841.89, 86)]
    db.exec(backfill)
    const got = ids.map(id => db.prepare('SELECT group_key, title FROM signature_sheet_prints WHERE id = ?').get(id))
    expect(got).toEqual([
      { group_key: String(kamp), title: 'KAMP ALANI' }, { group_key: String(fpu), title: 'FPU' },
      { group_key: 'none', title: 'PROJE ATANMAMIŞ' }, { group_key: null, title: null },
    ])
    db.prepare(`DELETE FROM signature_sheet_prints WHERE id IN (${ids.join(',')})`).run()
  })
})

describe('haftanın föy sayfaları (progress)', () => {
  it('aynı grup yeniden basılırsa en çok okunan baskı esas; okunmamış web baskısı beklenmez', async () => {
    const week = '2027-04-05'
    const first = await printSheet(fpu, week)
    const second = await printSheet(fpu, week)
    let res = await request(app).get(`/api/shifts/schedule/signature-sheet/progress?week_start=${week}`).set(auth())
    expect(res.body.prints.map(p => p.print_id)).toEqual([second.id])          // okuma yok → en yeni
    const ids = pageStaff(first.layout, 0)
    const ok = await request(app).post(`/api/shifts/schedule/signature-prints/${first.id}/reads`).set(auth())
      .send({ page: 0, rows: pageRows(ids, new Set(), weekDates(week)), photo_day: '2027-04-12' })
    expect(ok.status).toBe(200)
    res = await request(app).get(`/api/shifts/schedule/signature-sheet/progress?week_start=${week}`).set(auth())
    expect(res.body.prints.map(p => [p.print_id, p.read, p.total])).toEqual([[first.id, 1, 1]])   // sahada asılan bu

    // web'den (grupsuz) basılmış ama hiç okunmamış föy "eksik sayfa" üretmez
    getDB().prepare(`INSERT INTO signature_sheet_prints(week_start, dates_json, layout_json, page_count)
      VALUES(?, '[]', ?, 1)`).run(week, JSON.stringify({ columns: [], pages: [{ index: 0, kind: 'roster', department: 'WEB', rows: [] }] }))
    res = await request(app).get(`/api/shifts/schedule/signature-sheet/progress?week_start=${week}`).set(auth())
    expect(res.body.prints).toHaveLength(1)
  })

  it('basılmış haftada okunmamış geçmiş gün föyün son gününe kadar "bekleniyor", sonra "gelmedi"', async () => {
    const today = istanbulDate()
    const buHafta = mondayOf(today)
    const eski = mondayOf(new Date(Date.parse(`${today}T12:00:00Z`) - 21 * 86400000).toISOString().slice(0, 10))
    const db = getDB()
    const plan = db.prepare("INSERT OR IGNORE INTO shift_schedule(staff_id, dept_id, work_date, status) VALUES(?, ?, ?, 'scheduled')")
    for (const week of [buHafta, eski]) {
      for (const d of weekDates(week)) plan.run(staff[0], kat, d)
      await printSheet(kamp, week)
    }
    const covNow = buildSignatureCoverage({ from: buHafta, to: weekDates(buHafta)[6] })
    const dun = weekDates(buHafta).filter(d => d < today)
    for (const d of dun) expect(covNow.departments.find(x => x.id === kat).cells[d].status).toBe('pending')
    const covOld = buildSignatureCoverage({ from: eski, to: weekDates(eski)[6] })
    expect(covOld.departments.find(x => x.id === kat).cells[eski].status).toBe('missing')
  })
})
