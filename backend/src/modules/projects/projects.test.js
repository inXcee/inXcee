import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let adminToken, userToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  userToken = (await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })).body.token
})

const auth = (token) => ({ Authorization: `Bearer ${token}` })

describe('Projeler', () => {
  it('FPU ve Kamp Alanı hazır gelir', async () => {
    const res = await request(app).get('/api/projects').set(auth(adminToken))
    expect(res.status).toBe(200)
    const kodlar = res.body.map(p => p.code)
    expect(kodlar).toContain('FPU')
    expect(kodlar).toContain('KAMP')
  })

  it('her projenin kadro sayısı gelir', async () => {
    const res = await request(app).get('/api/projects').set(auth(adminToken))
    res.body.forEach(p => expect(typeof p.staff_count).toBe('number'))
  })

  it('yeni proje eklenebilir', async () => {
    const res = await request(app).post('/api/projects').set(auth(adminToken))
      .send({ name: 'Üçüncü Saha', code: 'SAHA3' })
    expect(res.status).toBe(201)
    expect(res.body.code).toBe('SAHA3')
  })

  it('aynı kod iki kez eklenemez', async () => {
    const res = await request(app).post('/api/projects').set(auth(adminToken))
      .send({ name: 'Kopya', code: 'FPU' })
    expect(res.status).toBe(409)
  })

  it('ad ve kod zorunlu', async () => {
    expect((await request(app).post('/api/projects').set(auth(adminToken)).send({ name: '' })).status).toBe(400)
  })

  it('proje adı güncellenebilir', async () => {
    const list = (await request(app).get('/api/projects').set(auth(adminToken))).body
    const hedef = list.find(p => p.code === 'SAHA3')
    const res = await request(app).put(`/api/projects/${hedef.id}`).set(auth(adminToken))
      .send({ name: 'Üçüncü Saha (revize)' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Üçüncü Saha (revize)')
  })

  it('personel bir projeye atanır ve geri alınabilir', async () => {
    const db = getDB()
    const staffId = Number(db.prepare("INSERT INTO staff(full_name, is_active) VALUES('Proje Test Personeli',1)").run().lastInsertRowid)
    const fpu = (await request(app).get('/api/projects').set(auth(adminToken))).body.find(p => p.code === 'FPU')

    const ata = await request(app).post('/api/projects/assign').set(auth(adminToken))
      .send({ staff_ids: [staffId], project_id: fpu.id })
    expect(ata.status).toBe(200)
    expect(ata.body.updated).toBe(1)
    expect(db.prepare('SELECT project_id FROM staff WHERE id=?').get(staffId).project_id).toBe(fpu.id)

    // project_id null → kadrodan çıkar
    const cikar = await request(app).post('/api/projects/assign').set(auth(adminToken))
      .send({ staff_ids: [staffId], project_id: null })
    expect(cikar.status).toBe(200)
    expect(db.prepare('SELECT project_id FROM staff WHERE id=?').get(staffId).project_id).toBeNull()
  })

  it('kadrosu olan proje silinemez, önce boşaltılmalı', async () => {
    const db = getDB()
    const fpu = (await request(app).get('/api/projects').set(auth(adminToken))).body.find(p => p.code === 'FPU')
    const staffId = Number(db.prepare("INSERT INTO staff(full_name, is_active, project_id) VALUES('Silme Engeli',1,?)").run(fpu.id).lastInsertRowid)

    const res = await request(app).delete(`/api/projects/${fpu.id}`).set(auth(adminToken))
    expect(res.status).toBe(409)
    db.prepare('DELETE FROM staff WHERE id=?').run(staffId)
  })

  it('yetkisiz rol proje yönetemez', async () => {
    expect((await request(app).post('/api/projects').set(auth(userToken)).send({ name: 'X', code: 'X' })).status).toBe(403)
    expect((await request(app).post('/api/projects/assign').set(auth(userToken)).send({ staff_ids: [1], project_id: 1 })).status).toBe(403)
    expect((await request(app).get('/api/projects')).status).toBe(401)
  })
})

describe('Kadro aktarımı (imza listesinden)', () => {
  let fpuId
  beforeAll(async () => {
    const db = getDB()
    db.prepare("INSERT INTO staff(full_name, is_active) VALUES('AKTARIM TAM EŞLEŞEN',1)").run()
    db.prepare("INSERT INTO staff(full_name, is_active) VALUES('AKTARIM YAZIM FARKI',1)").run()
    fpuId = (await request(app).get('/api/projects').set(auth(adminToken))).body.find(p => p.code === 'FPU').id
  })

  it('önizleme birebir / öneri / yeni olarak ayırır, hiçbir şeyi yazmaz', async () => {
    const db = getDB()
    const oncekiSayi = db.prepare('SELECT COUNT(*) n FROM staff').get().n
    const res = await request(app).post(`/api/projects/${fpuId}/roster/preview`).set(auth(adminToken))
      .send({ names: ['AKTARIM TAM EŞLEŞEN', 'AKTARIM YAZIM FARKl', 'BAMBAŞKA BİRİ'] })

    expect(res.status).toBe(200)
    expect(res.body.exact.map(x => x.name)).toContain('AKTARIM TAM EŞLEŞEN')
    expect(res.body.near[0]?.staff_name).toBe('AKTARIM YAZIM FARKI')
    expect(res.body.unknown).toContain('BAMBAŞKA BİRİ')
    // Önizleme yan etkisiz olmalı.
    expect(db.prepare('SELECT COUNT(*) n FROM staff').get().n).toBe(oncekiSayi)
  })

  it('uygula: seçilenleri atar ve yeni isimleri açar', async () => {
    const db = getDB()
    const mevcut = db.prepare("SELECT id FROM staff WHERE full_name='AKTARIM TAM EŞLEŞEN'").get()
    const res = await request(app).post(`/api/projects/${fpuId}/roster/apply`).set(auth(adminToken))
      .send({ assign_staff_ids: [mevcut.id], create_names: ['AKTARIM YENİ KİŞİ'] })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ assigned: 1, created: 1 })
    expect(db.prepare('SELECT project_id FROM staff WHERE id=?').get(mevcut.id).project_id).toBe(fpuId)
    const yeni = db.prepare("SELECT * FROM staff WHERE full_name='AKTARIM YENİ KİŞİ'").get()
    expect(yeni.project_id).toBe(fpuId)
    expect(yeni.is_active).toBe(1)
  })

  it('aynı ismi ikinci kez açmaz, mevcut kaydı kullanır', async () => {
    const db = getDB()
    const res = await request(app).post(`/api/projects/${fpuId}/roster/apply`).set(auth(adminToken))
      .send({ create_names: ['AKTARIM YENİ KİŞİ'] })
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(0)
    expect(db.prepare("SELECT COUNT(*) n FROM staff WHERE full_name='AKTARIM YENİ KİŞİ'").get().n).toBe(1)
  })

  it('olmayan proje 404', async () => {
    expect((await request(app).post('/api/projects/999999/roster/preview').set(auth(adminToken))
      .send({ names: ['X'] })).status).toBe(404)
  })

  it('yetkisiz rol aktarım yapamaz', async () => {
    expect((await request(app).post(`/api/projects/${fpuId}/roster/preview`).set(auth(userToken))
      .send({ names: [] })).status).toBe(403)
    expect((await request(app).post(`/api/projects/${fpuId}/roster/apply`).set(auth(userToken))
      .send({})).status).toBe(403)
  })
})
