import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { excelCodeFor } from './puantajExport.js'

describe('Excel puantaj kodu eşlemesi', () => {
  it('Excel sözlüğüne göre: S yıllık, R rapor, H hafta tatili, N çalıştı', () => {
    expect(excelCodeFor('on_leave', 'annual').code).toBe('S')
    expect(excelCodeFor('on_leave', 'sick').code).toBe('R')
    expect(excelCodeFor('off', null).code).toBe('H')
    expect(excelCodeFor('worked', null).code).toBe('N')
    expect(excelCodeFor('absent', null).code).toBe('E') // Excel'de Y = YARIM gün, devamsız değil
  })
  it('planlı gün fiilî devam değildir → dokunulmaz', () => {
    expect(excelCodeFor('scheduled', null)).toEqual({ code: null, manual: false })
  })
  it('alacak / ücretsiz izin elle işlenir', () => {
    expect(excelCodeFor('on_leave', 'owed')).toEqual({ code: null, manual: true })
    expect(excelCodeFor('on_leave', 'unpaid')).toEqual({ code: null, manual: true })
  })
})

describe('GET /api/shifts/puantaj-export', () => {
  let token, staffId
  beforeAll(async () => {
    process.env.DB_PATH = ':memory:'; initDB(); seedDev()
    token = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
    const db = getDB()
    staffId = db.prepare("INSERT INTO staff(full_name, is_active) VALUES('PUANTAJ AKTARIM KİŞİ', 1)").run().lastInsertRowid
    const ins = db.prepare('INSERT INTO shift_schedule(staff_id, work_date, status, leave_type) VALUES(?,?,?,?)')
    ins.run(staffId, '2026-10-05', 'off', null)
    ins.run(staffId, '2026-10-06', 'on_leave', 'annual')
    ins.run(staffId, '2026-10-07', 'scheduled', null)
    ins.run(staffId, '2026-11-01', 'off', null) // başka ay
  })

  it('kişi bazında gün → excel_code döndürür', async () => {
    const res = await request(app).get('/api/shifts/puantaj-export?month=2026-10').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const p = res.body.staff.find(s => s.staff_id === staffId)
    expect(Object.keys(p.days)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
    expect(p.days['2026-10-05'].excel_code).toBe('H')
    expect(p.days['2026-10-06'].excel_code).toBe('S')
    expect(p.days['2026-10-07'].excel_code).toBeNull()
  })

  it('ay biçimi doğrulanır', async () => {
    const res = await request(app).get('/api/shifts/puantaj-export?month=2026-13').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})
