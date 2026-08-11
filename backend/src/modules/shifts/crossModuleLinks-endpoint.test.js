import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken, supervisorToken, technicalToken, gun
const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
  gun = getDB().prepare('SELECT work_date FROM shift_schedule ORDER BY work_date DESC LIMIT 1').get()?.work_date
    || getDB().prepare("SELECT date('now') AS g").get().g
})

const cagir = (token, params = {}) => request(app).get('/api/shifts/cross-links')
  .query({ date: gun, ...params }).set(auth(token))

describe('GET /api/shifts/cross-links', () => {
  it('bes bagi da doner', async () => {
    const res = await cagir(managerToken)
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('200')
    expect(Object.keys(res.body.links)).toEqual(
      ['transport', 'meals', 'attendance', 'combined_risk', 'exited_future'])
  })

  // Olculemeyen bag gerekcesiz kalirsa "her sey uyumlu" sanilir.
  it('olculemeyen bagin gerekcesi yazili', async () => {
    const { body } = await cagir(managerToken)
    Object.values(body.links).forEach(l => {
      if (!l.measurable) expect(l.reason).toBeTruthy()
    })
  })

  // Gercek semada tablo/kolon adi kaymissa bu duser.
  it('gercek semada kaynak okuma hatasi yok', async () => {
    const { body } = await cagir(managerToken)
    Object.values(body.links).forEach(l => {
      if (!l.measurable) expect(l.reason).not.toMatch(/okunamadı/)
    })
  })

  it('bozuk tarih 400', async () => {
    expect((await cagir(managerToken, { date: 'x' })).status).toBe(400)
  })

  it('vardiya amiri gorebilir; yetkisiz rol 403, tokensiz 401', async () => {
    expect((await cagir(supervisorToken)).status).toBe(200)
    expect((await cagir(technicalToken)).status).toBe(403)
    expect((await request(app).get('/api/shifts/cross-links').query({ date: gun })).status).toBe(401)
  })
})
