import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Çizelge aktarımı ↔ İK kadrosu + kalıcı ad eşleştirmeleri
let mgr, fpuId, existingId
const auth = () => ({ Authorization: `Bearer ${mgr}` })
const cell = date => ({ date, startHour: 8, endHour: 17, status: 'scheduled', raw: '08:00 17:00' })
const week = (rows, extra = {}) => ({ weekDates: ['2026-11-02'], rows, unrecognized: [], ...extra })
const commit = body => request(app).post('/api/shifts/import').set(auth()).send(body)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  mgr = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  db.prepare("INSERT OR IGNORE INTO projects(code, name) VALUES('FPU', 'FPU')").run()
  fpuId = db.prepare("SELECT id FROM projects WHERE name='FPU'").get().id
  existingId = db.prepare("INSERT INTO staff(full_name, is_active) VALUES('MUHAMMED BUDAKX', 1)").run().lastInsertRowid
  // Arşivlenmiş aynı adlı kopya — aktif kişiyi gölgelememeli
  db.prepare("INSERT INTO staff(full_name, is_active) VALUES('MUHAMMED BUDAKX', 0)").run()
  const res = await request(app).post('/api/personnel/hr-roster').set(auth()).send({
    month: '2026-11', people: [
      { name: 'YENİ GELEN KADRO', tc: '10000000146', position: 'Garson', hire_date: '2026-10-28', project: 'FPU' },
    ],
  })
  expect(res.status).toBe(201)
})

describe('çizelge aktarımı + İK kadrosu', () => {
  it('İK kadrosunda olan yeni kişi bilgisiz kalmaz: aktarım durmadan, TC ile açılır', async () => {
    const body = week([{ name: 'Yeni Gelen Kadro', deptName: 'KADRO TEST', cells: [cell('2026-11-02')] }])
    const dry = await request(app).post('/api/shifts/import?dryRun=1').set(auth()).send(body)
    expect(dry.body.canCommit).toBe(true)
    expect(dry.body.staff.created[0]).toMatchObject({ hire_date: '2026-10-28', position: 'Garson', project_id: fpuId,
      fromHrRoster: ['hire_date', 'position', 'project_id'] })
    const res = await commit(body)
    expect(res.status).toBe(200)
    const s = getDB().prepare("SELECT tc_no, hire_date, position, project_id FROM staff WHERE full_name='Yeni Gelen Kadro'").get()
    expect(s).toEqual({ tc_no: '10000000146', hire_date: '2026-10-28', position: 'Garson', project_id: fpuId })
  })

  it('elle girilen bilgi İK kadrosundan önceliklidir', async () => {
    getDB().prepare("UPDATE hr_roster_people SET name='İKİNCİ KADRO', name_fold='ikinci kadro', tc_no=NULL").run()
    const body = week([{ name: 'İKİNCİ KADRO', cells: [cell('2026-11-02')] }],
      { newStaff: { 'İKİNCİ KADRO': { position: 'Şef' } } })
    const dry = await request(app).post('/api/shifts/import?dryRun=1').set(auth()).send(body)
    expect(dry.body.staff.created[0]).toMatchObject({ position: 'Şef', fromHrRoster: ['hire_date', 'project_id'] })
  })

  it('arşiv kopyası değil aktif kişi eşleşir', async () => {
    const res = await commit(week([{ name: 'MUHAMMED BUDAKX', cells: [cell('2026-11-03')] }]))
    expect(res.status).toBe(200)
    const row = getDB().prepare("SELECT staff_id FROM shift_schedule WHERE work_date='2026-11-03'").get()
    expect(row.staff_id).toBe(existingId)
  })

  it('onaylanan yazım farkı kalıcı olur, sonraki hafta sorulmaz; geri alma eşleştirmeyi siler', async () => {
    const body = week([{ name: 'MUHAMMED BUDAKX ', cells: [cell('2026-11-04')] }])
    body.rows[0].name = 'MUHAMMEDBUDAKX'   // boşluksuz yazım → aksansız eşleşme yok; elle eşleştirme gerekir
    const first = await commit({ ...body, mappings: { MUHAMMEDBUDAKX: existingId } })
    expect(first.status).toBe(200)
    expect(first.body.aliases.saved).toEqual([{ alias: 'MUHAMMEDBUDAKX', staffId: existingId }])
    // Sonraki hafta: eşleştirme vermeden de birebir eşleşir
    const next = await request(app).post('/api/shifts/import?dryRun=1').set(auth())
      .send(week([{ name: 'MUHAMMEDBUDAKX', cells: [cell('2026-11-09')] }], { weekDates: ['2026-11-09'] }))
    expect(next.body.canCommit).toBe(true)
    expect(next.body.staff).toMatchObject({ matched: 1, aliasMatched: 1, created: [] })
    // Geri alma bu aktarımın eşleştirmesini de siler
    const undo = await request(app).post(`/api/shifts/import/batches/${first.body.batchId}/undo`).set(auth())
    expect(undo.status).toBe(200)
    expect(getDB().prepare("SELECT COUNT(*) c FROM staff_aliases WHERE alias='MUHAMMEDBUDAKX'").get().c).toBe(0)
  })

  it('yazım farkı onayı (confirm.fuzzy) da eşleştirme olarak saklanır', async () => {
    const res = await commit(week([{ name: 'MUHAMMED BUDAKX', cells: [cell('2026-11-05')] },
      { name: 'MUHAMMED BUDAKXX', cells: [cell('2026-11-05')] }], { confirm: { fuzzy: true } }))
    // BUDAKXX aksansız da eşleşmez → yeni kişi; bilgi yok → aktarım durur
    expect(res.status).toBe(409)
    const db = getDB()
    db.prepare("INSERT INTO staff(full_name, is_active) VALUES('ŞULE ÖZTÜRKX', 1)").run()
    const ok = await commit(week([{ name: 'SULE OZTURKX', cells: [cell('2026-11-06')] }], { confirm: { fuzzy: true } }))
    expect(ok.status).toBe(200)
    expect(ok.body.aliases.saved[0]).toMatchObject({ alias: 'SULE OZTURKX' })
    const again = await request(app).post('/api/shifts/import?dryRun=1').set(auth())
      .send(week([{ name: 'SULE OZTURKX', cells: [cell('2026-11-07')] }]))
    expect(again.body.staff.fuzzyMatched).toEqual([])
    expect(again.body.canCommit).toBe(true)
  })
})
