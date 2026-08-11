import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Saf mantik elde kurulmus semaya karsi dogrulaniyor; burada gercek migration
// semasi (096), FK'ler ve rol yetkileri deneniyor.

let managerToken, supervisorToken, technicalToken, personelId, ikinciId, shiftDefId, gun

const auth = t => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const giris = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
  managerToken = await giris('mudur')
  supervisorToken = await giris('vardiya')
  technicalToken = await giris('teknik')
  const db = getDB()
  const kisiler = db.prepare('SELECT id FROM staff WHERE is_active = 1 ORDER BY id LIMIT 2').all()
  personelId = kisiler[0].id
  ikinciId = kisiler[1].id
  shiftDefId = db.prepare('SELECT id FROM shift_definitions ORDER BY id LIMIT 1').get().id
  // Cizelgede kaydi olmayan uzak bir gun sec: mevcut seed verisi ile carpismasin.
  gun = db.prepare("SELECT date('now', '+400 day') AS g").get().g
})

const ilanAc = (token = managerToken, body = {}) => request(app).post('/api/shifts/open-shifts')
  .send({ work_date: gun, shift_def_id: shiftDefId, ...body }).set(auth(token))

describe('acik vardiya uclari', () => {
  it('ilan acar, listeler, basvuru alir', async () => {
    const acilan = await ilanAc()
    expect(`${acilan.status} ${JSON.stringify(acilan.body).slice(0, 200)}`).toContain('201')

    const liste = await request(app).get('/api/shifts/open-shifts').set(auth(managerToken))
    expect(liste.body.items.some(i => i.id === acilan.body.id)).toBe(true)

    const basvuru = await request(app).post(`/api/shifts/open-shifts/${acilan.body.id}/apply`)
      .send({ staff_id: personelId, note: 'Musaitim' }).set(auth(supervisorToken))
    expect(basvuru.status).toBe(201)
  })

  it('aday listesi uygunluk ozetiyle gelir ve olculebilir', async () => {
    const { body: ilan } = await ilanAc()
    await request(app).post(`/api/shifts/open-shifts/${ilan.id}/apply`)
      .send({ staff_id: personelId }).set(auth(managerToken))

    const { body } = await request(app).get(`/api/shifts/open-shifts/${ilan.id}/applicants`).set(auth(managerToken))
    expect(body.items).toHaveLength(1)
    // Gercek semada hicbir kontrol 'unknown' kalmamali; kalirsa kolon adi kaymistir.
    expect(body.items[0].suitability.unknown).toEqual([])
  })

  it('secim cizelgeye yazar ve ilani kapatir', async () => {
    const { body: ilan } = await ilanAc()
    await request(app).post(`/api/shifts/open-shifts/${ilan.id}/apply`).send({ staff_id: ikinciId }).set(auth(managerToken))
    const secim = await request(app).post(`/api/shifts/open-shifts/${ilan.id}/select`)
      .send({ staff_id: ikinciId }).set(auth(managerToken))
    expect(`${secim.status} ${JSON.stringify(secim.body).slice(0, 300)}`).toContain('200')

    const satir = getDB().prepare('SELECT * FROM shift_schedule WHERE staff_id = ? AND work_date = ?').get(ikinciId, gun)
    expect(satir).toBeTruthy()
    expect(secim.body.open_shift.status).toBe('filled')
  })

  it('ayni gune ikinci kez atama engelli doner', async () => {
    const { body: ilan } = await ilanAc()
    await request(app).post(`/api/shifts/open-shifts/${ilan.id}/apply`).send({ staff_id: ikinciId }).set(auth(managerToken))
    const secim = await request(app).post(`/api/shifts/open-shifts/${ilan.id}/select`)
      .send({ staff_id: ikinciId }).set(auth(managerToken))
    expect(secim.status).toBe(409)
    expect(secim.body.suitability.blockers).toContain('already_working')
  })

  it('gecersiz govde 400, olmayan ilan 404', async () => {
    expect((await ilanAc(managerToken, { work_date: '01.01.2026' })).status).toBe(400)
    expect((await request(app).get('/api/shifts/open-shifts/999999/applicants').set(auth(managerToken))).status).toBe(404)
  })

  it('yetkisiz rol 403, tokensiz 401', async () => {
    expect((await request(app).get('/api/shifts/open-shifts').set(auth(technicalToken))).status).toBe(403)
    expect((await request(app).get('/api/shifts/open-shifts')).status).toBe(401)
  })
})

describe('uygunluk ve kapsama uclari', () => {
  it('uygunluk gercek semada tum kontrolleri olcer', async () => {
    const { body } = await request(app).get('/api/shifts/suitability')
      .query({ staff_id: personelId, date: gun, shift_def_id: shiftDefId }).set(auth(managerToken))
    expect(body.checks.map(c => c.key)).toEqual(
      expect.arrayContaining(['exited', 'already_working', 'on_leave', 'rest_period', 'weekly_hours', 'role_match', 'documents'])
    )
    expect(body.unknown).toEqual([])
  })

  it('kapsama karsilastirmasi olculebilir doner', async () => {
    const { body } = await request(app).get('/api/shifts/coverage-comparison')
      .query({ date: gun }).set(auth(managerToken))
    expect(body.available).toBe(true)
    expect(Array.isArray(body.rules)).toBe(true)
  })

  it('bozuk tarih 400', async () => {
    expect((await request(app).get('/api/shifts/coverage-comparison').query({ date: 'x' }).set(auth(managerToken))).status).toBe(400)
  })
})
