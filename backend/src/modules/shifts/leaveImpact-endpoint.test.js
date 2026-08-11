import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Saf mantik elde kurulmus semaya karsi dogrulaniyor; burada gercek migration
// semasi ve rol yetkileri deneniyor. Kolon adi degisirse burasi duser.

let managerToken, supervisorToken, technicalToken, personelId
const auth = t => ({ Authorization: `Bearer ${t}` })
const ARALIK = { start: '2026-03-02', end: '2026-03-04' }

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
  personelId = getDB().prepare('SELECT id FROM staff WHERE is_active = 1 ORDER BY id LIMIT 1').get().id
})

const cagir = (token, params = {}) => request(app).get('/api/shifts/leave-impact')
  .query({ staff_id: personelId, ...ARALIK, ...params }).set(auth(token))

describe('GET /api/shifts/leave-impact', () => {
  it('gercek semada tum bolumleri doner', async () => {
    const res = await cagir(managerToken)
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    for (const k of ['balance', 'conflicting_shifts', 'same_day_leaves', 'coverage_loss',
      'replacements', 'overtime_effect', 'year_end_forecast', 'recurring_pattern', 'warnings', 'unavailable']) {
      expect(res.body).toHaveProperty(k)
    }
    expect(res.body.range).toMatchObject({ ...ARALIK, days: 3 })
  })

  // Gercek semada hicbir kaynak okunamiyorsa analiz sessizce "sorun yok" der.
  it('gercek semada kaynak okuma hatasi yok', async () => {
    const { body } = await cagir(managerToken)
    expect(body.unavailable).toEqual([])
  })

  it('yillik disi turde bakiyeyi olcut saymaz', async () => {
    const { body } = await cagir(managerToken, { leave_type: 'sick' })
    expect(body.balance.applicable).toBe(false)
  })

  it('gecersiz girdi 400, olmayan personel 404', async () => {
    expect((await cagir(managerToken, { start: '02.03.2026' })).status).toBe(400)
    expect((await cagir(managerToken, { start: '2026-03-10', end: '2026-03-02' })).status).toBe(400)
    expect((await cagir(managerToken, { staff_id: 999999 })).status).toBe(404)
  })

  it('vardiya amiri gorebilir; yetkisiz rol 403, tokensiz 401', async () => {
    expect((await cagir(supervisorToken)).status).toBe(200)
    expect((await cagir(technicalToken)).status).toBe(403)
    expect((await request(app).get('/api/shifts/leave-impact').query({ staff_id: personelId, ...ARALIK })).status).toBe(401)
  })
})
