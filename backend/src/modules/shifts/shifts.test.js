import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { calcTax, workDaysInMonth } from './service.js'

let managerToken, shiftToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  shiftToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Shifts', () => {
  it('GET /departments returns array', async () => {
    const res = await request(app).get('/api/shifts/departments').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /definitions returns array', async () => {
    const res = await request(app).get('/api/shifts/definitions').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /schedule returns data for a week', async () => {
    const res = await request(app).get('/api/shifts/schedule?week=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
  })

  it('GET /personnel returns array', async () => {
    const res = await request(app).get('/api/shifts/personnel?date=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /statistics returns object', async () => {
    const res = await request(app).get('/api/shifts/statistics?date=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(typeof res.body).toBe('object')
  })

  it('POST /departments creates a department (manager)', async () => {
    const res = await request(app)
      .post('/api/shifts/departments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Test Departman', color_class: 'bg-blue-500', description: 'Test açıklama' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })

  it('POST /definitions creates a shift definition (manager)', async () => {
    const res = await request(app)
      .post('/api/shifts/definitions')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Test Vardiya', start_hour: '08:00', end_hour: '16:00', color_class: 'bg-green-500' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })
})

describe('Staff CRUD', () => {
  let createdStaffId

  it('GET /staff returns array', async () => {
    const res = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('GET /staff with filters', async () => {
    const res = await request(app).get('/api/shifts/staff?is_active=1&gender=male').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /staff/search returns results', async () => {
    const res = await request(app).get('/api/shifts/staff/search?q=Ali').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /staff creates a staff member (manager)', async () => {
    const res = await request(app)
      .post('/api/shifts/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        full_name: 'Test Personel',
        tc_no: '99999999999',
        phone: '05551112233',
        email: 'test@test.com',
        position: 'Test Pozisyon',
        gender: 'male',
        blood_type: 'A+'
      })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    createdStaffId = res.body.id
  })

  it('GET /staff/:id returns the created staff', async () => {
    const res = await request(app).get(`/api/shifts/staff/${createdStaffId}`).set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(res.body.full_name).toBe('Test Personel')
    expect(res.body.tc_no).toBe('99999999999')
  })

  it('GET /staff/:id/detail returns detailed info', async () => {
    const res = await request(app).get(`/api/shifts/staff/${createdStaffId}/detail`).set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(res.body.person).toBeTruthy()
    expect(res.body.person.full_name).toBe('Test Personel')
  })

  it('PUT /staff/:id updates staff (manager)', async () => {
    const res = await request(app)
      .put(`/api/shifts/staff/${createdStaffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ full_name: 'Güncellenmiş Personel', position: 'Yeni Pozisyon' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('DELETE /staff/:id soft-deletes staff (manager)', async () => {
    const res = await request(app)
      .delete(`/api/shifts/staff/${createdStaffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST /staff rejects without full_name', async () => {
    const res = await request(app)
      .post('/api/shifts/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ phone: '05551112233' })
    expect(res.status).toBe(400)
  })
})

describe('Leave & Overtime (staff_id)', () => {
  it('POST /leave creates a leave request with staff_id', async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    const staffId = staffRes.body[0]?.id
    if (!staffId) return

    const res = await request(app)
      .post('/api/shifts/leave')
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({ staff_id: staffId, leave_type: 'annual', start_date: '2026-04-01', end_date: '2026-04-03', reason: 'Test izin' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })

  it('GET /leave returns leave list', async () => {
    const res = await request(app).get('/api/shifts/leave').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /overtime creates overtime with staff_id', async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${managerToken}`)
    const staffId = staffRes.body[0]?.id
    if (!staffId) return

    const res = await request(app)
      .post('/api/shifts/overtime')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, work_date: '2026-03-20', hours: 3, reason: 'Test mesai' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })

  it('GET /overtime returns overtime list', async () => {
    const res = await request(app).get('/api/shifts/overtime').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('Departments CRUD', () => {
  let deptId

  it('POST /departments creates department', async () => {
    const res = await request(app)
      .post('/api/shifts/departments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'CRUD Test Dept', color_class: 'bg-red-500', description: 'Test' })
    expect(res.status).toBe(201)
    deptId = res.body.id
  })

  it('PUT /departments/:id updates department', async () => {
    const res = await request(app)
      .put(`/api/shifts/departments/${deptId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Updated Dept', color_class: 'bg-red-600' })
    expect(res.status).toBe(200)
  })

  it('DELETE /departments/:id deletes department', async () => {
    const res = await request(app)
      .delete(`/api/shifts/departments/${deptId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
  })

  it('POST /departments/assign assigns staff to dept', async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    const staffId = staffRes.body[0]?.id
    const deptRes = await request(app).get('/api/shifts/departments').set('Authorization', `Bearer ${shiftToken}`)
    const dId = deptRes.body[0]?.id
    if (!staffId || !dId) return

    const res = await request(app)
      .post('/api/shifts/departments/assign')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, dept_id: dId })
    expect(res.status).toBe(200)
  })
})

describe('Swap requests', () => {
  it('GET /swaps returns array', async () => {
    const res = await request(app).get('/api/shifts/swaps').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('calcTax — Turkish progressive income tax', () => {
  it('returns 0 for 0 gross', () => {
    expect(calcTax(0)).toBe(0)
  })

  it('taxes 110,000 TL entirely at 15%', () => {
    expect(calcTax(110_000)).toBe(16_500)
  })

  it('taxes 230,000 TL in two brackets', () => {
    // 110,000 × 0.15 = 16,500; 120,000 × 0.20 = 24,000; total = 40,500
    expect(calcTax(230_000)).toBe(40_500)
  })

  it('calculates marginal tax for 150,000 TL', () => {
    // 110,000 × 0.15 = 16,500; 40,000 × 0.20 = 8,000; total = 24,500
    expect(calcTax(150_000)).toBe(24_500)
  })

  it('handles amounts above top bracket', () => {
    // 110k×0.15 + 120k×0.20 + 640k×0.27 + 2,130k×0.35 + 500k×0.40
    // = 16,500 + 24,000 + 172,800 + 745,500 + 200,000 = 1,158,800
    expect(calcTax(3_500_000)).toBe(1_158_800)
  })
})

describe('workDaysInMonth', () => {
  it('March 2024 has 26 non-Sunday days', () => {
    // March 2024: 31 days, 5 Sundays (3,10,17,24,31) → 26
    expect(workDaysInMonth(2024, 3)).toBe(26)
  })

  it('February 2024 (leap) has 25 non-Sunday days', () => {
    // Feb 2024: 29 days, 4 Sundays (4,11,18,25) → 25
    expect(workDaysInMonth(2024, 2)).toBe(25)
  })

  it('January 2024 has 27 non-Sunday days', () => {
    // Jan 2024: 31 days, 4 Sundays (7,14,21,28) → 27
    expect(workDaysInMonth(2024, 1)).toBe(27)
  })
})

describe('Enhanced GET /shifts/puantaj', () => {
  it('returns 200 with valid month', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 400 without month param', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid month format', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026/03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('each row has all required financial fields', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    if (res.body.length === 0) return // seed may have no data for this month
    const row = res.body[0]
    const required = [
      'annual_leave_days', 'sick_leave_days', 'emergency_leave_days', 'other_leave_days',
      'daily_rate', 'base_pay', 'overtime_pay', 'leave_pay', 'gross',
      'ssi_worker', 'unemployment_worker', 'income_tax', 'stamp_tax',
      'total_deductions', 'net',
      'ssi_employer', 'unemployment_employer', 'employer_total_cost',
      'attend_rate', 'work_days_in_month', 'ytd_gross', 'ytd_tax',
    ]
    required.forEach(field => {
      expect(row).toHaveProperty(field)
      expect(typeof row[field]).toBe('number')
    })
  })

  it('net equals gross minus total_deductions', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    res.body.forEach(row => {
      expect(row.net).toBeCloseTo(row.gross - row.total_deductions, 1)
    })
  })
})

describe('GET /shifts/puantaj/export/csv', () => {
  it('returns 400 without month', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(400)
  })

  it('returns CSV with correct content-type', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv?month=2026-03')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/puantaj-2026-03\.csv/)
  })

  it('CSV starts with UTF-8 BOM and correct header', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv?month=2026-03')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    // BOM: \uFEFF
    expect(res.text.startsWith('\uFEFF')).toBe(true)
    const firstLine = res.text.replace('\uFEFF', '').split('\n')[0]
    expect(firstLine).toContain('TC No')
    expect(firstLine).toContain('Ad Soyad')
    expect(firstLine).toContain('Brüt')
    expect(firstLine).toContain('Net')
  })
})

describe('GET /shifts/puantaj/:staffId/days', () => {
  let existingStaffId

  beforeAll(async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    existingStaffId = staffRes.body[0]?.id
  })

  it('returns 400 without month', async () => {
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric staffId', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/notanumber/days?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns array with one entry per day of the month', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // March 2026 has 31 days
    expect(res.body.length).toBe(31)
  })

  it('each entry has date, day_of_week, and status', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    res.body.forEach(entry => {
      expect(entry).toHaveProperty('date')
      expect(entry).toHaveProperty('day_of_week')
      expect(entry).toHaveProperty('status')
      expect(['worked','absent','on_leave','overtime','scheduled','sunday','no_record']).toContain(entry.status)
    })
  })

  it('Sundays have status sunday', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    // March 1 2026 is a Sunday (day_of_week=0)
    const march1 = res.body.find(e => e.date === '2026-03-01')
    expect(march1).toBeDefined()
    expect(march1.status).toBe('sunday')
  })
})

describe('getYtdGross', () => {
  it('returns 0 for January (no prior months)', async () => {
    // Any staff_id, month=1 means no prior months → ytdGross=0
    // We test via the puantaj endpoint: no previous months means ytd_gross === gross for January
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    const staffId = staffRes.body[0]?.id
    if (!staffId) return

    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-01')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    // For Jan, ytd_gross = gross (no prior months)
    const row = res.body.find(r => r.id === staffId)
    if (row && row.gross !== undefined) {
      expect(row.ytd_gross).toBe(row.gross)
    }
  })
})

// ── H4 Vardiya derinleştirme ──
describe('H4 V1 — Çakışma kontrol', () => {
  it('POST /schedule/check-conflicts boş entries için no conflict', async () => {
    const res = await request(app).post('/api/shifts/schedule/check-conflicts')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [] })
    expect(res.status).toBe(200)
    expect(res.body.has_conflicts).toBe(false)
    expect(res.body.conflicts).toEqual([])
  })

  it('mevcut vardiya varsa shift_exists çakışması döner', async () => {
    const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${managerToken}`)).body
    if (!staff?.length) return
    const today = new Date().toISOString().slice(0, 10)
    await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staff[0].id, work_date: today, shift_def_id: 1 }] })
    const res = await request(app).post('/api/shifts/schedule/check-conflicts')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staff[0].id, work_date: today, shift_def_id: 2 }] })
    expect(res.body.has_conflicts).toBe(true)
    expect(res.body.conflicts[0].kind).toBe('shift_exists')
  })
})

describe('H4 V3 — Holidays', () => {
  it('GET /holidays 2026 tatilleri seed edilmiş', async () => {
    const res = await request(app).get('/api/shifts/holidays?year=2026').set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.find(h => h.date === '2026-01-01')).toBeTruthy()
  })

  it('CREATE/UPDATE/DELETE holiday', async () => {
    const add = await request(app).post('/api/shifts/holidays').set('Authorization', `Bearer ${managerToken}`)
      .send({ date: '2030-01-01', name: 'Test Tatili', multiplier: 1.5 })
    expect(add.status).toBe(201)
    const id = add.body.id

    const upd = await request(app).put(`/api/shifts/holidays/${id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ multiplier: 2.0 })
    expect(upd.status).toBe(200)

    const del = await request(app).delete(`/api/shifts/holidays/${id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
  })

  it('eksik veri 400 döner', async () => {
    const res = await request(app).post('/api/shifts/holidays').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'sadece ad' })
    expect(res.status).toBe(400)
  })
})

describe('H4 V7 — Bordro export', () => {
  it('GET /payroll-export aylık personel başı veri döner', async () => {
    const month = new Date().toISOString().slice(0, 7)
    const res = await request(app).get(`/api/shifts/payroll-export?month=${month}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('month', month)
    expect(Array.isArray(res.body.rows)).toBe(true)
    res.body.rows.forEach(r => {
      expect(r).toHaveProperty('worked_days')
      expect(r).toHaveProperty('absent_days')
      expect(r).toHaveProperty('overtime_hours')
      expect(r).toHaveProperty('holiday_days')
    })
  })

  it('yanlış ay formatı 400 döner', async () => {
    const res = await request(app).get('/api/shifts/payroll-export?month=2026')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(400)
  })
})

describe('H4 V8 — Birleşik devamsızlık', () => {
  it('GET /combined-absences dönüyor', async () => {
    const res = await request(app).get('/api/shifts/combined-absences')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    res.body.forEach(r => {
      expect(r).toHaveProperty('shift_absent')
      expect(r).toHaveProperty('transport_no_show')
      expect(r).toHaveProperty('worked')
    })
  })
})

// ── H8 Bordro detaylı (B1+B2+B3+B5) ──
describe('H8 — Kesinti CRUD', () => {
  it('kesinti ekle/listele/sil', async () => {
    const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${managerToken}`)).body
    if (!staff?.length) return
    const add = await request(app).post('/api/shifts/deductions').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staff[0].id, period: '2026-10', kind: 'damage', amount: 150.50, description: 'Test hasar' })
    expect(add.status).toBe(201)

    const list = await request(app).get('/api/shifts/deductions?period=2026-10').set('Authorization', `Bearer ${managerToken}`)
    expect(list.body.find(d => d.id === add.body.id)).toBeTruthy()

    const del = await request(app).delete(`/api/shifts/deductions/${add.body.id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
  })

  it('geçersiz kind 400', async () => {
    const r = await request(app).post('/api/shifts/deductions').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: 1, period: '2026-10', kind: 'invalid', amount: 50 })
    expect(r.status).toBe(400)
  })

  it('eksik alan 400', async () => {
    const r = await request(app).post('/api/shifts/deductions').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: 1, kind: 'damage' })
    expect(r.status).toBe(400)
  })
})

describe('H8 — payroll-detailed', () => {
  it('GET /payroll-detailed SGK + kesinti döner', async () => {
    const month = new Date().toISOString().slice(0, 7)
    const r = await request(app).get(`/api/shifts/payroll-detailed?month=${month}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.body.month).toBe(month)
    r.body.rows.forEach(row => {
      expect(row).toHaveProperty('weighted_days')
      expect(row).toHaveProperty('sgk_days')
      expect(row).toHaveProperty('total_deductions')
    })
  })
})
