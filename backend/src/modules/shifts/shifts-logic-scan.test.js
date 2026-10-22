import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { importSchedule, undoImportBatch } from './import.js'
import { saatSayisi, vardiyaSuresi, evaluateSuitability } from './suitability.js'

// Vardiya / puantaj / bordro mantık taraması (Ekim 2026) — her blok kanıtlanmış bir hatanın regresyon testi.

let managerToken
const auth = req => req.set('Authorization', `Bearer ${managerToken}`)
const newStaff = (name, isActive = 1) => getDB().prepare(
  'INSERT INTO staff(full_name, is_active, salary) VALUES(?, ?, 30000)',
).run(name, isActive).lastInsertRowid
const cellAt = (staffId, date) => getDB().prepare(
  'SELECT status, shift_def_id, leave_type FROM shift_schedule WHERE staff_id=? AND work_date=?',
).get(staffId, date)
const shiftCell = (date, startHour = 8, endHour = 17) => ({ date, startHour, endHour, status: 'scheduled', raw: `${startHour}-${endHour}` })
const lock = period => auth(request(app).post('/api/shifts/period-locks')).send({ period, note: 'test' })
const unlock = period => auth(request(app).delete(`/api/shifts/period-locks/${period}`))

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('kilitli ay — puantajı değiştiren her yol 423 döner', () => {
  let staffId, otherId
  beforeAll(async () => {
    staffId = newStaff('KİLİT TARAMA KİŞİ')
    otherId = newStaff('KİLİT TARAMA DİĞER')
    // Kilitlemeden önce kaynak hafta (Şubat) ve kilitli aydaki mevcut kayıtlar
    getDB().prepare(`INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?, '2025-02-24', 'scheduled')`).run(staffId)
    getDB().prepare(`INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?, '2025-03-05', 'worked')`).run(staffId)
    expect((await lock('2025-03')).status).toBe(201)
  })

  it('puantaj gün detayı (hücre düzenleme) kilitli aya yazamaz', async () => {
    const res = await auth(request(app).post('/api/shifts/puantaj/day-detail'))
      .send({ staff_id: staffId, work_date: '2025-03-10', status: 'absent', absent_reason: 'gelmedi' })
    expect(res.status).toBe(423)
    expect(cellAt(staffId, '2025-03-10')).toBeUndefined()
  })

  it('Excel çizelge aktarımı kilitli aya yazamaz', async () => {
    const res = await auth(request(app).post('/api/shifts/import')).send({
      weekDates: ['2025-03-11'],
      rows: [{ name: 'KİLİT TARAMA KİŞİ', deptName: null, cells: [shiftCell('2025-03-11')] }],
      unrecognized: [],
    })
    expect(res.status).toBe(423)
    expect(cellAt(staffId, '2025-03-11')).toBeUndefined()
  })

  it('aktarımın geri alınması kilitli ayı değiştiremez', async () => {
    const report = importSchedule({
      weekDates: ['2025-04-07'],
      rows: [{ name: 'KİLİT TARAMA KİŞİ', deptName: null, cells: [shiftCell('2025-04-07')] }],
      unrecognized: [],
    }, null)
    expect((await lock('2025-04')).status).toBe(201)
    const res = await auth(request(app).post(`/api/shifts/import/batches/${report.batchId}/undo`))
    expect(res.status).toBe(423)
    expect(cellAt(staffId, '2025-04-07')).toMatchObject({ status: 'scheduled' })
    expect(getDB().prepare('SELECT undone_at FROM schedule_import_batches WHERE id=?').get(report.batchId).undone_at).toBeNull()
    await unlock('2025-04')
  })

  it('hafta kopyalama kilitli aya yazamaz', async () => {
    const res = await auth(request(app).post('/api/shifts/schedule/copy-week'))
      .send({ source_week: '2025-02-24', target_week: '2025-03-03' })
    expect(res.status).toBe(423)
    expect(cellAt(staffId, '2025-03-03')).toBeUndefined()
  })

  it('eski rotasyon ucu kilitli aya yazamaz', async () => {
    const defId = getDB().prepare('SELECT id FROM shift_definitions LIMIT 1').get().id
    const res = await auth(request(app).post('/api/shifts/schedule/rotation'))
      .send({ staff_ids: [staffId], shift_def_ids: [defId], start_date: '2025-03-17', weeks: 1 })
    expect(res.status).toBe(423)
    expect(cellAt(staffId, '2025-03-17')).toBeUndefined()
  })

  it('vardiya takası onayı kilitli ayın gününü değiştiremez', async () => {
    const [d1, d2] = getDB().prepare('SELECT id FROM shift_definitions ORDER BY id LIMIT 2').all().map(r => r.id)
    getDB().prepare(`UPDATE shift_schedule SET shift_def_id=? WHERE staff_id=? AND work_date='2025-03-05'`).run(d1, staffId)
    getDB().prepare(`INSERT INTO shift_schedule(staff_id, work_date, status, shift_def_id) VALUES(?, '2025-03-05', 'worked', ?)`).run(otherId, d2)
    const created = await auth(request(app).post('/api/shifts/swaps')).send({
      requester_id: staffId, target_id: otherId, swap_date: '2025-03-05', requester_shift_id: d1, target_shift_id: d2,
    })
    expect(created.status).toBe(201)
    const res = await auth(request(app).patch(`/api/shifts/swaps/${created.body.id}/approve`))
    expect(res.status).toBe(423)
    expect(cellAt(staffId, '2025-03-05').shift_def_id).toBe(d1)
  })

  it('fazla mesai ekleme / düzenleme / silme kilitli ayda engellenir', async () => {
    const add = await auth(request(app).post('/api/shifts/overtime'))
      .send({ staff_id: staffId, work_date: '2025-03-05', hours: 2, reason: 'x' })
    expect(add.status).toBe(423)
    expect(cellAt(staffId, '2025-03-05').status).toBe('worked')

    const lockedId = getDB().prepare(`INSERT INTO overtime_records(staff_id, work_date, hours, reason)
      VALUES(?, '2025-03-06', 3, 'kilit öncesi')`).run(staffId).lastInsertRowid
    const put = await auth(request(app).put(`/api/shifts/overtime/${lockedId}`)).send({ hours: 5 })
    expect(put.status).toBe(423)
    const del = await auth(request(app).delete(`/api/shifts/overtime/${lockedId}`))
    expect(del.status).toBe(423)
    expect(getDB().prepare('SELECT hours FROM overtime_records WHERE id=?').get(lockedId).hours).toBe(3)

    // Açık aydaki kayıt kilitli aya taşınamaz
    const openId = getDB().prepare(`INSERT INTO overtime_records(staff_id, work_date, hours, reason)
      VALUES(?, '2025-05-06', 3, 'açık ay')`).run(staffId).lastInsertRowid
    const move = await auth(request(app).put(`/api/shifts/overtime/${openId}`)).send({ work_date: '2025-03-07' })
    expect(move.status).toBe(423)
    expect(getDB().prepare('SELECT work_date FROM overtime_records WHERE id=?').get(openId).work_date).toBe('2025-05-06')
  })
})

describe('Excel aktarımı onaylı puantaj gününü beklemeye düşürür', () => {
  it('aktarım onaylı günün kaydını değiştirince gün onayı pending olur', () => {
    const staffId = newStaff('ONAY DÜŞME KİŞİ')
    getDB().prepare(`INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?, '2025-05-12', 'off')`).run(staffId)
    const approvalId = getDB().prepare(`INSERT INTO puantaj_daily_approvals(period, work_date, dept_scope, status)
      VALUES('2025-05', '2025-05-12', 'all', 'approved')`).run().lastInsertRowid
    importSchedule({
      weekDates: ['2025-05-12'],
      rows: [{ name: 'ONAY DÜŞME KİŞİ', deptName: null, cells: [shiftCell('2025-05-12')] }],
      unrecognized: [],
    }, null)
    expect(cellAt(staffId, '2025-05-12').status).toBe('scheduled')
    expect(getDB().prepare('SELECT status FROM puantaj_daily_approvals WHERE id=?').get(approvalId).status).toBe('pending')
  })

  it('hiçbir şeyi değiştirmeyen yeniden aktarım onayı bozmaz', () => {
    const staffId = newStaff('ONAY KORUMA KİŞİ')
    const payload = {
      weekDates: ['2025-05-13'],
      rows: [{ name: 'ONAY KORUMA KİŞİ', deptName: null, cells: [shiftCell('2025-05-13')] }],
      unrecognized: [],
    }
    importSchedule(payload, null)
    expect(cellAt(staffId, '2025-05-13').status).toBe('scheduled')
    const approvalId = getDB().prepare(`INSERT INTO puantaj_daily_approvals(period, work_date, dept_scope, status)
      VALUES('2025-05', '2025-05-13', 'all', 'approved')`).run().lastInsertRowid
    importSchedule(payload, null)
    expect(getDB().prepare('SELECT status FROM puantaj_daily_approvals WHERE id=?').get(approvalId).status).toBe('approved')
  })
})

describe('Excel aktarımı geri alma — aynı kişi iki satırda', () => {
  it('geri alma, aktarım öncesi kaydı geri yükler (ilk satırın yazdığını değil)', () => {
    const staffId = newStaff('ÇİFT SATIR KİŞİ')
    getDB().prepare(`INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?, '2025-06-02', 'off')`).run(staffId)
    const report = importSchedule({
      weekDates: ['2025-06-02', '2025-06-03'],
      rows: [
        { name: 'ÇİFT SATIR KİŞİ', deptName: 'ÇİFT A', cells: [shiftCell('2025-06-02', 8, 17), shiftCell('2025-06-03', 8, 17)] },
        { name: 'ÇİFT SATIR KİŞİ', deptName: 'ÇİFT B', cells: [shiftCell('2025-06-02', 15, 24), shiftCell('2025-06-03', 15, 24)] },
      ],
      unrecognized: [],
    }, null)
    undoImportBatch(report.batchId)
    expect(cellAt(staffId, '2025-06-02')).toMatchObject({ status: 'off', shift_def_id: null })
    expect(cellAt(staffId, '2025-06-03')).toBeUndefined()
    // Sessiz üzerine yazma önizlemede görünür
    expect(report.anomalies.warnings.some(w => w.kind === 'duplicate' && w.staff === 'ÇİFT SATIR KİŞİ')).toBe(true)
  })
})

describe('Excel aktarımı geri alma — oluşturulan departman / vardiya tanımı sonra başka aktarımda kullanıldıysa', () => {
  it('eski haftanın geri alınması yabancı anahtar hatasıyla çökmez, kullanılan tanımlar korunur', () => {
    const staffId = newStaff('SONRAKİ HAFTA KİŞİ')
    const week = (date) => ({
      weekDates: [date],
      rows: [{ name: 'SONRAKİ HAFTA KİŞİ', deptName: 'TARAMA YENİ BÖLÜM', cells: [shiftCell(date, 7, 19)] }],
      unrecognized: [],
    })
    const first = importSchedule(week('2025-09-01'), null)
    expect(first.depts.created).toEqual(['TARAMA YENİ BÖLÜM'])
    expect(first.shiftDefs.created).toHaveLength(1)
    importSchedule(week('2025-09-08'), null) // ikinci hafta aynı bölüm + vardiya tanımını kullanır

    const result = undoImportBatch(first.batchId)
    expect(result.scheduleDeleted).toBe(1)
    expect(cellAt(staffId, '2025-09-01')).toBeUndefined()
    expect(cellAt(staffId, '2025-09-08')).toMatchObject({ status: 'scheduled' })
    expect(getDB().prepare("SELECT 1 FROM departments WHERE name='TARAMA YENİ BÖLÜM'").get()).toBeTruthy()
  })
})

describe('gece yarısı biten vardiya (15-24) saat hesabı', () => {
  it('24:00 bitiş okunur; Akşam 15-24 = 9 saat', () => {
    expect(saatSayisi('24')).toBe(24)
    expect(saatSayisi(24)).toBe(24)
    expect(saatSayisi('24:00')).toBe(24)
    expect(saatSayisi('24:30')).toBeNull()
    expect(vardiyaSuresi(15, 24)).toBe(9)
  })

  it('önceki gün Akşam 15-24 çalışan için dinlenme ve haftalık süre "ölçülemedi" sayılmaz', () => {
    const db = getDB()
    const staffId = newStaff('AKŞAM DİNLENME KİŞİ')
    const aksam = db.prepare(`INSERT INTO shift_definitions(name, start_hour, end_hour, color_class)
      VALUES('Akşam Tarama', 15, 24, 'bg-x')`).run().lastInsertRowid
    const sabah = db.prepare(`INSERT INTO shift_definitions(name, start_hour, end_hour, color_class)
      VALUES('Sabah Tarama', 6, 15, 'bg-y')`).run().lastInsertRowid
    db.prepare(`INSERT INTO shift_schedule(staff_id, work_date, status, shift_def_id) VALUES(?, '2025-06-09', 'scheduled', ?)`).run(staffId, aksam)
    const result = evaluateSuitability({ staff_id: staffId, date: '2025-06-10', shift_def_id: sabah })
    const rest = result.checks.find(c => c.key === 'rest_period')
    expect(rest.status).toBe('warn') // 24:00 → 06:00 = 6 saat
    expect(rest.detail).toContain('6.0 saat')
    expect(result.checks.find(c => c.key === 'weekly_hours').status).not.toBe('unknown')
  })
})

describe('puantaj gün dökümü — aynı güne birden çok fazla mesai kaydı', () => {
  it('gün hücresi FM saatlerinin TOPLAMINI gösterir, gün tekrarlanmaz', async () => {
    const staffId = newStaff('ÇİFT FM KİŞİ')
    getDB().prepare(`INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?, '2025-07-07', 'worked')`).run(staffId)
    getDB().prepare(`INSERT INTO overtime_records(staff_id, work_date, hours, reason) VALUES(?, '2025-07-07', 2, 'a')`).run(staffId)
    getDB().prepare(`INSERT INTO overtime_records(staff_id, work_date, hours, reason) VALUES(?, '2025-07-07', 3, 'b')`).run(staffId)

    const month = await auth(request(app).get('/api/shifts/puantaj/days?month=2025-07'))
    expect(month.status).toBe(200)
    const day = month.body.days[staffId].find(d => d.date === '2025-07-07')
    expect(day.overtime_hours).toBe(5)

    const single = await auth(request(app).get(`/api/shifts/puantaj/${staffId}/days?month=2025-07`))
    expect(single.status).toBe(200)
    const rows = (single.body.days || single.body).filter(d => d.date === '2025-07-07')
    expect(rows).toHaveLength(1)
    expect(rows[0].overtime_hours).toBe(5)
  })
})

describe('bordro dökümleri — ay içinde ayrılan (pasif) personel', () => {
  it('çalıştığı günler olan pasif personel bordro dışa aktarımında yer alır', async () => {
    const staffId = newStaff('AYRILAN BORDRO KİŞİ', 0)
    for (const d of ['2025-08-04', '2025-08-05', '2025-08-06']) {
      getDB().prepare(`INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?, ?, 'worked')`).run(staffId, d)
    }
    const exp = await auth(request(app).get('/api/shifts/payroll-export?month=2025-08'))
    expect(exp.status).toBe(200)
    expect(exp.body.rows.find(r => r.id === staffId)).toMatchObject({ worked_days: 3 })
    const det = await auth(request(app).get('/api/shifts/payroll-detailed?month=2025-08'))
    expect(det.status).toBe(200)
    expect(det.body.rows.find(r => r.id === staffId)).toMatchObject({ worked_days: 3 })
    // Hiç kaydı olmayan pasif personel eskisi gibi listelenmez
    const idle = newStaff('BOŞTA PASİF KİŞİ', 0)
    expect(exp.body.rows.find(r => r.id === idle)).toBeUndefined()
  })
})
