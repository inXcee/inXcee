import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Saf mantik elde kurulmus semaya karsi dogrulaniyor; burada gercek migration
// semasi (095), yetkiler ve migration'in yazdigi 270 saat satiri deneniyor.

let managerToken, supervisorToken, technicalToken
const auth = t => ({ Authorization: `Bearer ${t}` })
const AY = '2026-04'

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
})

const ozet = (token, params = {}) => request(app).get('/api/shifts/overtime-overview')
  .query({ period: AY, ...params }).set(auth(token))

describe('GET /api/shifts/overtime-overview', () => {
  it('gercek semada tum bolumleri doner ve kaynak hatasi yok', async () => {
    const res = await ozet(managerToken)
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    for (const k of ['totals', 'chain', 'budget', 'person_limit', 'yearly_limit',
      'month_end_forecast', 'fairness', 'top_people', 'warnings', 'unavailable']) {
      expect(res.body).toHaveProperty(k)
    }
    expect(res.body.unavailable).toEqual([])
  })

  // Migration 095 Is Kanunu m.41 satirini yaziyor; okunamazsa sinir olcusuz kalir.
  it('yillik 270 saat siniri migration ile geliyor', async () => {
    const { body } = await ozet(managerToken)
    expect(body.yearly_limit).toMatchObject({ known: true, limit_hours: 270 })
  })

  // Aylik tavan kurumsal tercih; migration koymaz, bu yuzden bilinmiyor olmali.
  it('aylik tavan tanimsizken asim ilan etmez', async () => {
    const { body } = await ozet(managerToken)
    expect(body.budget.known).toBe(false)
    expect(body.warnings).not.toContain('Aylık mesai bütçesi aşıldı')
  })

  it('bozuk donem 400', async () => {
    expect((await ozet(managerToken, { period: '2026-13' })).status).toBe(400)
  })

  it('vardiya amiri gorebilir; yetkisiz rol 403, tokensiz 401', async () => {
    expect((await ozet(supervisorToken)).status).toBe(200)
    expect((await ozet(technicalToken)).status).toBe(403)
    expect((await request(app).get('/api/shifts/overtime-overview').query({ period: AY })).status).toBe(401)
  })
})

describe('PUT /api/shifts/overtime-budgets', () => {
  it('yonetici tavan koyar, ozet onu kullanir', async () => {
    const res = await request(app).put('/api/shifts/overtime-budgets')
      .send({ scope: 'global', monthly_hours: 120, per_person_monthly_hours: 20 }).set(auth(managerToken))
    expect(res.status).toBe(200)
    const { body } = await ozet(managerToken)
    expect(body.budget).toMatchObject({ known: true, limit_hours: 120 })
    expect(body.person_limit).toMatchObject({ known: true, limit_hours: 20 })
  })

  it('ayni kapsami cogaltmaz', async () => {
    await request(app).put('/api/shifts/overtime-budgets')
      .send({ scope: 'global', monthly_hours: 80 }).set(auth(managerToken))
    const say = getDB().prepare("SELECT COUNT(*) c FROM overtime_budgets WHERE scope='global' AND period IS NULL").get().c
    expect(say).toBe(1)
  })

  it('vardiya amiri tavan koyamaz', async () => {
    expect((await request(app).put('/api/shifts/overtime-budgets')
      .send({ scope: 'global', monthly_hours: 50 }).set(auth(supervisorToken))).status).toBe(403)
  })

  it('gecersiz govde 400', async () => {
    expect((await request(app).put('/api/shifts/overtime-budgets')
      .send({ scope: 'department' }).set(auth(managerToken))).status).toBe(400)
  })
})
