import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, viewToken, staffId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  viewToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
  const db = getDB()
  let s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  if (!s) {
    db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run('Kart Test')
    s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('Kart Test')
  }
  staffId = s.id
})

const auth = (t) => ({ Authorization: `Bearer ${t}` })

function freshResident(name, assigned = true) {
  const db = getDB()
  const id = db.prepare('INSERT INTO personnel(full_name, company) VALUES(?, ?)')
    .run(name, 'Kart Test A.Ş.').lastInsertRowid
  if (assigned) {
    const roomId = db.prepare(`
      INSERT INTO rooms(block, floor, room_no, capacity, active_beds)
      VALUES('KT', 0, ?, 6, 1)
    `).run(`C-${id}`).lastInsertRowid
    db.prepare('INSERT INTO room_assignments(personnel_id, room_id, bed_no) VALUES(?,?,1)')
      .run(id, roomId)
  }
  return id
}

describe('cards — kart üretimi (amaç bazında ayrı)', () => {
  it('giriş kartı üretir (AVS-A: prefix)', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    expect(r.status).toBe(201)
    expect(r.body.card_type).toBe('access')
    expect(r.body.code).toMatch(/^AVS-A:/)
    expect(r.body.status).toBe('active')
  })

  it('yemek kartı ayrı üretir (AVS-M: prefix)', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal' })
    expect(r.status).toBe(201)
    expect(r.body.card_type).toBe('meal')
    expect(r.body.code).toMatch(/^AVS-M:/)
  })

  it('sakine ayrı çamaşır kartı üretir (AVS-C: prefix)', async () => {
    const residentId = freshResident('Çamaşır Kart Sakini')
    const r = await request(app).post(`/api/cards/personnel/${residentId}/issue`)
      .set(auth(token)).send({ card_type: 'laundry' })
    expect(r.status).toBe(201)
    expect(r.body.card_type).toBe('laundry')
    expect(r.body.code).toMatch(/^AVS-C:/)
  })

  it('çamaşır kartını staff için üretmez', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`)
      .set(auth(token)).send({ card_type: 'laundry' })
    expect(r.status).toBe(400)
  })

  it('odasız sakine çamaşır kartı üretmez', async () => {
    const residentId = freshResident('Odasız Kart Sakini', false)
    const r = await request(app).post(`/api/cards/personnel/${residentId}/issue`)
      .set(auth(token)).send({ card_type: 'laundry' })
    expect(r.status).toBe(409)
  })

  it('aynı tip tekrar istenince mevcut aktif kartı döner (idempotent)', async () => {
    const r1 = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    const r2 = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    expect(r2.body.code).toBe(r1.body.code)
  })

  it('regenerate eskiyi iptal eder, yeni kod üretir', async () => {
    const r1 = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    const r2 = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access', regenerate: true })
    expect(r2.body.code).not.toBe(r1.body.code)
    expect(r2.status).toBe(201)
    // eski kart revoked olmalı
    const db = getDB()
    const old = db.prepare('SELECT status FROM cards WHERE code=?').get(r1.body.code)
    expect(old.status).toBe('revoked')
  })

  it('geçersiz card_type 400', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'xyz' })
    expect(r.status).toBe(400)
  })

  it('GET kişinin kartlarını listeler (access + meal)', async () => {
    await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal' })
    const r = await request(app).get(`/api/cards/staff/${staffId}`).set(auth(token))
    expect(r.status).toBe(200)
    const types = r.body.filter(c => c.status === 'active').map(c => c.card_type)
    expect(types).toContain('access')
    expect(types).toContain('meal')
  })

  it('revoke sonrası aynı tip yeniden üretilebilir', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal', regenerate: true })
    const rev = await request(app).patch(`/api/cards/${issued.body.id}/revoke`).set(auth(token)).send({})
    expect(rev.status).toBe(200)
    const fresh = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal' })
    expect(fresh.status).toBe(201)
    expect(fresh.body.code).not.toBe(issued.body.code)
  })

  it('bulk-issue eksik kartları doldurur, ikinci çağrı 0', async () => {
    const db = getDB()
    db.prepare("DELETE FROM cards WHERE card_type='access'").run()
    const r1 = await request(app).post('/api/cards/bulk-issue').set(auth(token)).send({ card_type: 'access' })
    expect(r1.status).toBe(200)
    expect(r1.body.generated).toBeGreaterThanOrEqual(1)
    const r2 = await request(app).post('/api/cards/bulk-issue').set(auth(token)).send({ card_type: 'access' })
    expect(r2.body.generated).toBe(0)
  })

  it('roster aktif staff + kart durumunu döner', async () => {
    // staffId'ye giriş kartı ver, yemek kartını revoke et → roster access dolu, meal boş olmalı
    await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    const meal = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal', regenerate: true })
    await request(app).patch(`/api/cards/${meal.body.id}/revoke`).set(auth(token)).send({})
    const r = await request(app).get('/api/cards/roster').set(auth(token))
    expect(r.status).toBe(200)
    const row = r.body.find(x => x.id === staffId)
    expect(row).toBeTruthy()
    expect(row.access_code).toMatch(/^AVS-A:/)
    expect(row.meal_id).toBeFalsy() // revoke sonrası aktif yemek kartı yok
  })

  it('roster ?q ile isme göre filtreler', async () => {
    const r = await request(app).get('/api/cards/roster?q=__yokboyle__').set(auth(token))
    expect(r.status).toBe(200)
    expect(r.body).toEqual([])
  })

  it('sakin roster yalnız aktif odalı sakinleri ve çamaşır kartını döner', async () => {
    const activeId = freshResident('Roster Aktif Sakin')
    const inactiveId = freshResident('Roster Çıkmış Sakin', false)
    await request(app).post(`/api/cards/personnel/${activeId}/issue`).set(auth(token))
      .send({ card_type: 'laundry' })
    const r = await request(app).get('/api/cards/roster?holder_type=personnel')
      .set(auth(token))
    expect(r.status).toBe(200)
    const active = r.body.find(row => row.id === activeId)
    expect(active).toMatchObject({ block: 'KT', laundry_id: expect.any(Number) })
    expect(active.laundry_code).toMatch(/^AVS-C:/)
    expect(r.body.some(row => row.id === inactiveId)).toBe(false)
  })

  it('toplu çamaşır kartını yalnız aktif odalı ve kartı eksik sakinlere üretir', async () => {
    const activeId = freshResident('Bulk Aktif Sakin')
    const inactiveId = freshResident('Bulk Odasız Sakin', false)
    getDB().prepare("DELETE FROM cards WHERE card_type='laundry'").run()
    const r1 = await request(app).post('/api/cards/bulk-issue').set(auth(token))
      .send({ holder_type: 'personnel', card_type: 'laundry' })
    expect(r1.status).toBe(200)
    expect(r1.body.generated).toBeGreaterThanOrEqual(1)
    expect(getDB().prepare(`
      SELECT id FROM cards WHERE holder_type='personnel' AND holder_id=?
        AND card_type='laundry' AND status='active'
    `).get(activeId)).toBeTruthy()
    expect(getDB().prepare(`
      SELECT id FROM cards WHERE holder_type='personnel' AND holder_id=?
        AND card_type='laundry' AND status='active'
    `).get(inactiveId)).toBeUndefined()
    const r2 = await request(app).post('/api/cards/bulk-issue').set(auth(token))
      .send({ holder_type: 'personnel', card_type: 'laundry' })
    expect(r2.body.generated).toBe(0)
  })

  it('karta özel PDF döner', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    const r = await request(app).get(`/api/cards/${issued.body.id}/pdf`).set(auth(token))
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/pdf/)
    expect(r.body.length).toBeGreaterThan(500)
  })
})

describe('cards — yetki', () => {
  it('mgr olmayan kart üretemez (403)', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(viewToken)).send({ card_type: 'access' })
    expect(r.status).toBe(403)
  })
  it('view rolü kartları görebilir (200)', async () => {
    const r = await request(app).get(`/api/cards/staff/${staffId}`).set(auth(viewToken))
    expect(r.status).toBe(200)
  })
})

describe('cards — Zod sweep', () => {
  it('gecersiz card_type 400 doner', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token))
      .send({ card_type: 'vip' })
    expect(r.status).toBe(400)
  })

  it('bos nfc_uid bind 400 doner', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token))
      .send({ card_type: 'meal', regenerate: true })
    const r = await request(app).patch(`/api/cards/${issued.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: '' })
    expect(r.status).toBe(400)
  })
})

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/0lvAAAAAElFTkSuQmCC',
  'base64',
)

describe('cards — telefonla kayıt (NFC normalize + foto)', () => {
  it('bind-nfc UID\'i normalize eder (büyük harf, ayraçsız)', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token))
      .send({ card_type: 'access', regenerate: true })
    const r = await request(app).patch(`/api/cards/${issued.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: '04:1a:2b' })
    expect(r.status).toBe(200)
    const stored = getDB().prepare('SELECT nfc_uid FROM cards WHERE id=?').get(issued.body.id).nfc_uid
    expect(stored).toBe('041A2B')
  })

  it('kart fotoğrafı yükler ve photo_url döner', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token))
      .send({ card_type: 'meal', regenerate: true })
    const r = await request(app).post(`/api/cards/${issued.body.id}/photo`).set(auth(token))
      .attach('photo', PNG_1x1, 'kart.png')
    expect(r.status).toBe(200)
    expect(r.body.photo_url).toMatch(/^\/uploads\//)
    const list = await request(app).get(`/api/cards/staff/${staffId}`).set(auth(token))
    const meal = list.body.find(c => c.id === issued.body.id)
    expect(meal.photo_url).toBe(r.body.photo_url)
  })

  it('fotoğrafsız upload 400 döner', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token))
      .send({ card_type: 'access', regenerate: true })
    const r = await request(app).post(`/api/cards/${issued.body.id}/photo`).set(auth(token))
    expect(r.status).toBe(400)
  })

  it('view rolü (camasir) foto yükleyemez (403)', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token))
      .send({ card_type: 'access', regenerate: true })
    const r = await request(app).post(`/api/cards/${issued.body.id}/photo`).set(auth(viewToken))
      .attach('photo', PNG_1x1, 'kart.png')
    expect(r.status).toBe(403)
  })
})

describe('cards — toplu basım (batch PDF)', () => {
  it('aktif kartlar için toplu PDF döner', async () => {
    // En az 1 aktif access kart olduğundan emin ol
    await request(app).post('/api/cards/bulk-issue').set(auth(token)).send({ card_type: 'access' })
    const r = await request(app).get('/api/cards/batch-pdf?card_type=access').set(auth(token))
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/pdf/)
    expect(r.body.length).toBeGreaterThan(500)
  }, 15_000)

  it('geçersiz card_type 400 döner', async () => {
    const r = await request(app).get('/api/cards/batch-pdf?card_type=vip').set(auth(token))
    expect(r.status).toBe(400)
  })

  it('sakin çamaşır kartları için toplu PDF döner', async () => {
    freshResident('PDF Çamaşır Sakini')
    await request(app).post('/api/cards/bulk-issue').set(auth(token))
      .send({ holder_type: 'personnel', card_type: 'laundry' })
    const r = await request(app).get('/api/cards/batch-pdf?card_type=laundry').set(auth(token))
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/pdf/)
    expect(r.body.length).toBeGreaterThan(500)
  }, 15_000)

  it('ids ile boş seçim 400 döner', async () => {
    const r = await request(app).get('/api/cards/batch-pdf?card_type=access&ids=99999999').set(auth(token))
    expect(r.status).toBe(400)
  })

  it('view rolü (camasir) toplu PDF üretemez (403)', async () => {
    const r = await request(app).get('/api/cards/batch-pdf?card_type=access').set(auth(viewToken))
    expect(r.status).toBe(403)
  })

  it('tek-kart PDF hâlâ çalışır (drawCard refactor regresyonu)', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal', regenerate: true })
    const r = await request(app).get(`/api/cards/${issued.body.id}/pdf`).set(auth(token))
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/pdf/)
    expect(r.body.length).toBeGreaterThan(500)
  })
})

describe('cards — hızlı seri NFC kayıt (enroll-nfc)', () => {
  // İzole staff (paylaşılan staffId'ye dokunma)
  function freshStaff(name) {
    return getDB().prepare("INSERT INTO staff(full_name, is_active) VALUES(?, 1)").run(name).lastInsertRowid
  }

  it('kartı olmayan kişide kart üretir ve NFC bağlar', async () => {
    const id = freshStaff('Enroll Yeni')
    const r = await request(app).post('/api/cards/enroll-nfc').set(auth(token))
      .send({ holder_id: id, card_type: 'access', nfc_uid: 'AA11BB22' })
    expect(r.status).toBe(200)
    expect(r.body.created).toBe(true)
    expect(r.body.card_id).toBeTruthy()
    const card = getDB().prepare('SELECT * FROM cards WHERE id=?').get(r.body.card_id)
    expect(card.status).toBe('active')
    expect(card.nfc_uid).toBe('AA11BB22')
  })

  it('sakinin çamaşır kartını NFC ile üretip bağlar', async () => {
    const id = freshResident('Enroll Çamaşır Sakini')
    const r = await request(app).post('/api/cards/enroll-nfc').set(auth(token))
      .send({ holder_type: 'personnel', holder_id: id, card_type: 'laundry', nfc_uid: 'CAFE104' })
    expect(r.status).toBe(200)
    expect(r.body.created).toBe(true)
    expect(r.body.code).toMatch(/^AVS-C:/)
  })

  it('mevcut aktif karta bağlar (created=false, aynı kart)', async () => {
    const id = freshStaff('Enroll Mevcut')
    const issued = await request(app).post(`/api/cards/staff/${id}/issue`).set(auth(token)).send({ card_type: 'meal' })
    const r = await request(app).post('/api/cards/enroll-nfc').set(auth(token))
      .send({ holder_id: id, card_type: 'meal', nfc_uid: 'CC33DD44' })
    expect(r.status).toBe(200)
    expect(r.body.created).toBe(false)
    expect(r.body.card_id).toBe(issued.body.id)
  })

  it('UID normalize edilir', async () => {
    const id = freshStaff('Enroll Normalize')
    const r = await request(app).post('/api/cards/enroll-nfc').set(auth(token))
      .send({ holder_id: id, card_type: 'access', nfc_uid: '0a:1b:2c' })
    expect(r.status).toBe(200)
    expect(getDB().prepare('SELECT nfc_uid FROM cards WHERE id=?').get(r.body.card_id).nfc_uid).toBe('0A1B2C')
  })

  it('UID başka karta bağlıysa 409', async () => {
    const a = freshStaff('Enroll A'), b = freshStaff('Enroll B')
    await request(app).post('/api/cards/enroll-nfc').set(auth(token)).send({ holder_id: a, card_type: 'access', nfc_uid: 'DUPUID99' })
    const r = await request(app).post('/api/cards/enroll-nfc').set(auth(token)).send({ holder_id: b, card_type: 'access', nfc_uid: 'DUPUID99' })
    expect(r.status).toBe(409)
  })

  it('boş nfc_uid 400', async () => {
    const id = freshStaff('Enroll Bos')
    const r = await request(app).post('/api/cards/enroll-nfc').set(auth(token)).send({ holder_id: id, card_type: 'access', nfc_uid: '' })
    expect(r.status).toBe(400)
  })

  it('view rolü (camasir) enroll edemez (403)', async () => {
    const id = freshStaff('Enroll Yetki')
    const r = await request(app).post('/api/cards/enroll-nfc').set(auth(viewToken)).send({ holder_id: id, card_type: 'access', nfc_uid: 'EE55' })
    expect(r.status).toBe(403)
  })
})

describe('cards — analitik', () => {
  it('analytics endpoint blokları döner', async () => {
    const r = await request(app).get('/api/cards/analytics?days=30').set(auth(token))
    expect(r.status).toBe(200)
    expect(r.body.days).toBe(30)
    expect(Array.isArray(r.body.summary)).toBe(true)
    expect(r.body.summary.find(s => s.card_type === 'access')).toBeTruthy()
    expect(r.body.summary.find(s => s.card_type === 'laundry')).toBeTruthy()
    expect(Array.isArray(r.body.usageByDay)).toBe(true)
    expect(Array.isArray(r.body.usageByResult)).toBe(true)
    expect(Array.isArray(r.body.topStations)).toBe(true)
  })

  it('view rolü (camasir) analitiği görebilir (200)', async () => {
    const r = await request(app).get('/api/cards/analytics').set(auth(viewToken))
    expect(r.status).toBe(200)
  })

  it('anonim erişim reddedilir (401)', async () => {
    const r = await request(app).get('/api/cards/analytics')
    expect(r.status).toBe(401)
  })
})
