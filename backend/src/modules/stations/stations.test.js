import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, viewToken, staffId, entryKey, cafeKey
let accessUid = 'NFC-ACCESS-001'
let mealUid = 'NFC-MEAL-001'

const auth = (t) => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  viewToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
  const db = getDB()
  let s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  if (!s) { db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run('İstasyon Test'); s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('İstasyon Test') }
  staffId = s.id
  // Faz 4: yemekhane uygunluğu için bu personeli bugün vardiyaya yaz (deterministik)
  db.prepare(`INSERT OR REPLACE INTO shift_schedule(staff_id,work_date,status) VALUES(?,?, 'scheduled')`)
    .run(staffId, new Date().toISOString().slice(0, 10))

  // Giriş + yemek kartı üret, NFC UID bağla
  const access = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access', regenerate: true })
  await request(app).patch(`/api/cards/${access.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: accessUid })
  const meal = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal', regenerate: true })
  await request(app).patch(`/api/cards/${meal.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: mealUid })

  // İstasyonlar
  entryKey = (await request(app).post('/api/stations').set(auth(token)).send({ name: 'Ana Giriş', station_type: 'entry' })).body.api_key
  cafeKey  = (await request(app).post('/api/stations').set(auth(token)).send({ name: 'Yemekhane', station_type: 'cafeteria' })).body.api_key
})

describe('stations — Zod sweep', () => {
  it('cok uzun istasyon adi 400 doner', async () => {
    const r = await request(app).post('/api/stations').set(auth(token))
      .send({ name: 'A'.repeat(121), station_type: 'entry' })
    expect(r.status).toBe(400)
  })

  it('gecersiz istasyon tipi 400 doner', async () => {
    const r = await request(app).post('/api/stations').set(auth(token))
      .send({ name: 'Geçerli', station_type: 'invalid' })
    expect(r.status).toBe(400)
  })
})

describe('stations — CRUD & yetki', () => {
  it('create raw key bir kez döner, liste hash sızdırmaz', async () => {
    const r = await request(app).post('/api/stations').set(auth(token)).send({ name: 'Çıkış', station_type: 'exit' })
    expect(r.status).toBe(201)
    expect(r.body.api_key).toMatch(/^ST-/)
    const list = await request(app).get('/api/stations').set(auth(token))
    expect(list.status).toBe(200)
    expect(list.body.every(s => !('api_key_hash' in s) && !('api_key' in s))).toBe(true)
  })

  it('geçersiz tip 400', async () => {
    const r = await request(app).post('/api/stations').set(auth(token)).send({ name: 'X', station_type: 'foo' })
    expect(r.status).toBe(400)
  })

  it('mgr olmayan istasyon oluşturamaz (403)', async () => {
    const r = await request(app).post('/api/stations').set(auth(viewToken)).send({ name: 'Y', station_type: 'entry' })
    expect(r.status).toBe(403)
  })

  it('/me istasyon kendi kimliğini key ile döner', async () => {
    const r = await request(app).get('/api/stations/me').set('X-Station-Key', entryKey)
    expect(r.status).toBe(200)
    expect(r.body.station_type).toBe('entry')
    expect(r.body).not.toHaveProperty('api_key_hash')
  })

  it('rotate-key eski anahtarı geçersiz kılar', async () => {
    const created = await request(app).post('/api/stations').set(auth(token)).send({ name: 'Rot', station_type: 'entry' })
    const oldKey = created.body.api_key
    const rot = await request(app).post(`/api/stations/${created.body.id}/rotate-key`).set(auth(token))
    expect(rot.body.api_key).toMatch(/^ST-/)
    expect(rot.body.api_key).not.toBe(oldKey)
    // eski anahtarla okutma artık reddedilir
    const scan = await request(app).post('/api/stations/scan').set('X-Station-Key', oldKey).send({ raw_uid: accessUid })
    expect(scan.status).toBe(401)
  })
})

describe('stations — okutma (scan)', () => {
  it('anahtarsız okutma 401', async () => {
    const r = await request(app).post('/api/stations/scan').send({ raw_uid: accessUid })
    expect(r.status).toBe(401)
  })

  it('giriş istasyonunda access kartı OK + sahip bilgisi', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: accessUid })
    expect(r.status).toBe(200)
    expect(r.body.result).toBe('ok')
    expect(r.body.event_type).toBe('entry')
    expect(r.body.holder.full_name).toBeTruthy()
  })

  it('tanımsız UID → unknown_card + event loglanır', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'YOK-123' })
    expect(r.body.result).toBe('unknown_card')
    // raw_uid normalize edilerek saklanır (YOK-123 → YOK123)
    const ev = getDB().prepare("SELECT * FROM access_events WHERE raw_uid='YOK123'").get()
    expect(ev.result).toBe('unknown_card')
  })

  it('farklı formatta okutulan UID eşleşir (telefon kaydı ↔ istasyon scan normalizasyonu)', async () => {
    // Paylaşılan staffId'ye dokunmamak için ayrı personel
    const fid = getDB().prepare("INSERT INTO staff(full_name, is_active) VALUES('Format Test', 1)").run().lastInsertRowid
    const c = await request(app).post(`/api/cards/staff/${fid}/issue`).set(auth(token)).send({ card_type: 'access' })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: '0A:1B:2C' })
    // istasyon farklı ayraç/küçük harfle gönderse de eşleşmeli
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: '0a-1b-2c' })
    expect(r.body.result).toBe('ok')
  })

  it('yemekhanede access kartı → not_eligible', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: accessUid })
    expect(r.body.result).toBe('not_eligible')
  })

  it('yemekhanede yemek kartı OK (event_type=meal)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: mealUid, meal_type: 'lunch' })
    expect(r.body.result).toBe('ok')
    expect(r.body.event_type).toBe('meal')
    expect(r.body.meal_type).toBe('lunch')
  })

  it('iptal kart → denied', async () => {
    const c = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access', regenerate: true })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: 'NFC-REVOKED' })
    await request(app).patch(`/api/cards/${c.body.id}/revoke`).set(auth(token))
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'NFC-REVOKED' })
    expect(r.body.result).toBe('denied')
  })

  it('recent-events son hareketleri sahip adıyla döner', async () => {
    const r = await request(app).get('/api/stations/recent-events').set(auth(token))
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThan(0)
    expect(r.body[0]).toHaveProperty('station_name')
  })
})

describe('stations — turnike kapı sinyali (Faz 7a)', () => {
  const tUid = 'NFC-TURNIKE-OK'
  beforeAll(async () => {
    // Taze access kartı (accessUid önceki testlerde revoke edilmiş olabilir)
    const c = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access', regenerate: true })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: tUid })
  })

  it('başarılı giriş → access_granted true (kapı açılır)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: tUid })
    expect(r.body.result).toBe('ok')
    expect(r.body.access_granted).toBe(true)
  })

  it('tanımsız kart → access_granted false (kapı kapalı)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'TURNIKE-YOK' })
    expect(r.body.result).toBe('unknown_card')
    expect(r.body.access_granted).toBe(false)
  })

  it('yemekhanede access kartı (not_eligible) → access_granted false', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: tUid })
    expect(r.body.access_granted).toBe(false)
  })
})

describe('stations — kartsız manuel giriş (Faz 7b)', () => {
  let pid, pBlackId
  beforeAll(() => {
    const db = getDB()
    db.prepare('INSERT INTO personnel(full_name) VALUES(?)').run('Manuel Kisi')
    pid = db.prepare("SELECT id FROM personnel WHERE full_name='Manuel Kisi'").get().id
    db.prepare("INSERT INTO personnel(full_name,is_blacklisted,blacklist_reason) VALUES('Manuel Kara',1,'Tehdit')").run()
    pBlackId = db.prepare("SELECT id FROM personnel WHERE full_name='Manuel Kara'").get().id
  })

  it('kartsız kişi için giriş kaydı → ok + card_id NULL access_events', async () => {
    const r = await request(app).post('/api/stations/manual').set('X-Station-Key', entryKey)
      .field('holder_type', 'personnel').field('holder_id', String(pid))
    expect(r.body.result).toBe('ok')
    expect(r.body.access_granted).toBe(true)
    expect(r.body.manual).toBe(true)
    const ev = getDB().prepare("SELECT * FROM access_events WHERE holder_type='personnel' AND holder_id=? ORDER BY id DESC").get(pid)
    expect(ev.card_id).toBeNull()
    expect(ev.event_type).toBe('entry')
  })

  it('eksik holder → 400', async () => {
    const r = await request(app).post('/api/stations/manual').set('X-Station-Key', entryKey).field('holder_type', 'personnel')
    expect(r.status).toBe(400)
  })

  it('bulunamayan kişi → 404', async () => {
    const r = await request(app).post('/api/stations/manual').set('X-Station-Key', entryKey)
      .field('holder_type', 'personnel').field('holder_id', '999999')
    expect(r.status).toBe(404)
  })

  it('kartsız kara listeli kişi → alarm + access_granted false', async () => {
    const r = await request(app).post('/api/stations/manual').set('X-Station-Key', entryKey)
      .field('holder_type', 'personnel').field('holder_id', String(pBlackId))
    expect(r.body.result).toBe('alarm')
    expect(r.body.access_granted).toBe(false)
  })

  it('anahtarsız manuel kayıt → 401', async () => {
    const r = await request(app).post('/api/stations/manual').field('holder_type', 'personnel').field('holder_id', String(pid))
    expect(r.status).toBe(401)
  })
})

describe('stations — ziyaretçi süreli kart (Faz 5b)', () => {
  const visUid = 'NFC-VIS-001', expUid = 'NFC-VIS-EXP'

  beforeAll(async () => {
    const db = getDB()
    db.prepare('INSERT INTO visitors(full_name) VALUES(?)').run('Ziyaretci A')
    const visId = db.prepare("SELECT id FROM visitors WHERE full_name='Ziyaretci A'").get().id
    const c = await request(app).post(`/api/cards/visitor/${visId}/issue`).set(auth(token)).send({ card_type: 'access', valid_until: '2999-01-01 00:00:00' })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: visUid })

    db.prepare('INSERT INTO visitors(full_name) VALUES(?)').run('Ziyaretci B')
    const visExp = db.prepare("SELECT id FROM visitors WHERE full_name='Ziyaretci B'").get().id
    const c2 = await request(app).post(`/api/cards/visitor/${visExp}/issue`).set(auth(token)).send({ card_type: 'access', valid_until: '2000-01-01 00:00:00' })
    await request(app).patch(`/api/cards/${c2.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: expUid })
  })

  it('geçerli ziyaretçi kartı giriş → ok + ziyaretçi adı', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: visUid })
    expect(r.body.result).toBe('ok')
    expect(r.body.holder.full_name).toBe('Ziyaretci A')
  })

  it('çıkış okutması ziyaretçi kartını otomatik iptal eder, tekrar giriş reddedilir', async () => {
    const exitKey = (await request(app).post('/api/stations').set(auth(token)).send({ name: 'Cikis5b', station_type: 'exit' })).body.api_key
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', exitKey).send({ raw_uid: visUid })
    expect(r.body.result).toBe('ok')
    // nfc_uid normalize edilerek saklanır (NFC-VIS-001 → NFCVIS001)
    expect(getDB().prepare('SELECT status FROM cards WHERE nfc_uid=?').get('NFCVIS001').status).toBe('revoked')
    const r2 = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: visUid })
    expect(r2.body.result).toBe('denied')
  })

  it('süresi dolmuş kart → denied (expired)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: expUid })
    expect(r.body.result).toBe('denied')
    expect(r.body.reason_code).toBe('expired')
  })
})

describe('stations — yemekhane uygunluğu (Faz 4)', () => {
  const today = new Date().toISOString().slice(0, 10)
  let eligId, noShiftId, leaveId
  const eligUid = 'NFC-ELIG-001', noShiftUid = 'NFC-NOSHIFT-001', leaveUid = 'NFC-LEAVE-001'

  beforeAll(async () => {
    const db = getDB()
    const mk = (name) => {
      db.prepare('INSERT INTO staff(full_name,is_active) VALUES(?,1)').run(name)
      return db.prepare('SELECT id FROM staff WHERE full_name=?').get(name).id
    }
    eligId = mk('Faz4 Uygun'); noShiftId = mk('Faz4 Vardiyasiz'); leaveId = mk('Faz4 Izinli')

    const issueMeal = async (sid, uid) => {
      const m = await request(app).post(`/api/cards/staff/${sid}/issue`).set(auth(token)).send({ card_type: 'meal', regenerate: true })
      await request(app).patch(`/api/cards/${m.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: uid })
    }
    await issueMeal(eligId, eligUid)
    await issueMeal(noShiftId, noShiftUid)
    await issueMeal(leaveId, leaveUid)

    const sched = db.prepare(`INSERT OR REPLACE INTO shift_schedule(staff_id,work_date,status) VALUES(?,?,?)`)
    sched.run(eligId, today, 'scheduled')       // bugün çalışıyor → hak var
    sched.run(leaveId, today, 'on_leave')        // çizelgede izinli
    // noShiftId: bugün hiç kayıt yok → planlı değil
    db.prepare(`INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status) VALUES(?,?,?,?,1,'approved')`)
      .run(leaveId, 'annual', today, today)
  })

  it('vardiyalı personel yemek okutur → ok + meal_logs yazılır (method=qr)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: eligUid, meal_type: 'lunch' })
    expect(r.body.result).toBe('ok')
    expect(r.body.event_type).toBe('meal')
    const ml = getDB().prepare('SELECT * FROM meal_logs WHERE staff_id=? AND meal_type=? AND meal_date=?').get(eligId, 'lunch', today)
    expect(ml).toBeTruthy()
    expect(ml.method).toBe('qr')
  })

  it('aynı personel aynı öğünü tekrar okutur → duplicate (ikinci kez meal_logs yazılmaz)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: eligUid, meal_type: 'lunch' })
    expect(r.body.result).toBe('duplicate')
    const cnt = getDB().prepare('SELECT COUNT(*) c FROM meal_logs WHERE staff_id=? AND meal_type=? AND meal_date=?').get(eligId, 'lunch', today).c
    expect(cnt).toBe(1)
  })

  it('bugün vardiyada olmayan personel → not_eligible (not_scheduled)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: noShiftUid, meal_type: 'lunch' })
    expect(r.body.result).toBe('not_eligible')
    expect(r.body.reason_code).toBe('not_scheduled')
    const ml = getDB().prepare('SELECT 1 FROM meal_logs WHERE staff_id=? AND meal_date=?').get(noShiftId, today)
    expect(ml).toBeFalsy()
  })

  it('onaylı izinde olan personel → not_eligible (on_leave)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: leaveUid, meal_type: 'dinner' })
    expect(r.body.result).toBe('not_eligible')
    expect(r.body.reason_code).toBe('on_leave')
  })

  it('meal_type gönderilmezse saate göre türetir, yine de kaydeder', async () => {
    // farklı personel/öğün çakışmasın diye yeni bir vardiyalı personel
    const db = getDB()
    db.prepare('INSERT INTO staff(full_name,is_active) VALUES(?,1)').run('Faz4 Saatlik')
    const sid = db.prepare("SELECT id FROM staff WHERE full_name='Faz4 Saatlik'").get().id
    const m = await request(app).post(`/api/cards/staff/${sid}/issue`).set(auth(token)).send({ card_type: 'meal', regenerate: true })
    await request(app).patch(`/api/cards/${m.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: 'NFC-AUTO-MEAL' })
    db.prepare(`INSERT OR REPLACE INTO shift_schedule(staff_id,work_date,status) VALUES(?,?, 'scheduled')`).run(sid, today)
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: 'NFC-AUTO-MEAL' })
    expect(r.body.result).toBe('ok')
    expect(['breakfast', 'lunch', 'dinner', 'snack']).toContain(r.body.meal_type)
  })
})

describe('stations — kiosk pratiklik (search-holders + my-events)', () => {
  it('search-holders anahtarsız 401', async () => {
    const r = await request(app).get('/api/stations/search-holders?q=test')
    expect(r.status).toBe(401)
  })

  it('search-holders 2 karakter altında boş dizi döner', async () => {
    const r = await request(app).get('/api/stations/search-holders?q=a').set('X-Station-Key', entryKey)
    expect(r.status).toBe(200)
    expect(r.body).toEqual([])
  })

  it('search-holders isimle aktif staff + kamptaki personnel bulur', async () => {
    const db = getDB()
    db.prepare("INSERT INTO staff(full_name, is_active) VALUES('Arama Personeli', 1)").run()
    db.prepare("INSERT INTO staff(full_name, is_active) VALUES('Arama Pasif', 0)").run()
    db.prepare("INSERT INTO personnel(full_name, company) VALUES('Arama İşçisi', 'Firma A')").run()
    const r = await request(app).get('/api/stations/search-holders?q=Arama').set('X-Station-Key', entryKey)
    expect(r.status).toBe(200)
    const names = r.body.map(p => p.full_name)
    expect(names).toContain('Arama Personeli')
    expect(names).toContain('Arama İşçisi')
    expect(names).not.toContain('Arama Pasif') // pasif staff listelenmez
    const staffRow = r.body.find(p => p.full_name === 'Arama Personeli')
    expect(staffRow.holder_type).toBe('staff')
  })

  it('my-events yalnız kendi istasyonunun okutmalarını döner', async () => {
    // Paylaşılan kart durumuna bağımlı olmamak için taze staff + access kartı
    const db = getDB()
    const sid = db.prepare("INSERT INTO staff(full_name, is_active) VALUES('MyEvents Test', 1)").run().lastInsertRowid
    const c = await request(app).post(`/api/cards/staff/${sid}/issue`).set(auth(token)).send({ card_type: 'access' })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: 'NFC-MYEVENTS' })
    // cafe istasyonunun mevcut event sayısı — entry okutması bunu DEĞİŞTİRMEMELİ
    const cafeBefore = (await request(app).get('/api/stations/my-events?limit=20').set('X-Station-Key', cafeKey)).body.length
    const scan = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'NFC-MYEVENTS' })
    expect(scan.body.result).toBe('ok')
    const entry = await request(app).get('/api/stations/my-events?limit=5').set('X-Station-Key', entryKey)
    expect(entry.status).toBe(200)
    expect(entry.body.length).toBeGreaterThan(0)
    expect(entry.body[0].holder_name).toBe('MyEvents Test') // isim join'lenir
    expect(entry.body[0].result).toBe('ok')
    const cafeAfter = (await request(app).get('/api/stations/my-events?limit=20').set('X-Station-Key', cafeKey)).body.length
    expect(cafeAfter).toBe(cafeBefore)
  })

  it('my-events anahtarsız 401', async () => {
    const r = await request(app).get('/api/stations/my-events')
    expect(r.status).toBe(401)
  })
})

describe('stations — stats-today + hareket filtreleri', () => {
  it('stats-today istasyon başına bugünkü sayıları döner', async () => {
    const r = await request(app).get('/api/stations/stats-today').set(auth(token))
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.stations)).toBe(true)
    expect(r.body.totals).toBeTypeOf('object')
    const anaGiris = r.body.stations.find(s => s.name === 'Ana Giriş')
    expect(anaGiris).toBeTruthy()
    expect(anaGiris.total).toBeGreaterThan(0) // önceki testler okutma yaptı
    expect(anaGiris.ok_count + anaGiris.fail_count).toBe(anaGiris.total)
  })

  it('stats-today yetkisiz 401', async () => {
    const r = await request(app).get('/api/stations/stats-today')
    expect(r.status).toBe(401)
  })

  it('recent-events station_id filtresi yalnız o istasyonu döner', async () => {
    const db = getDB()
    const anaGirisId = db.prepare("SELECT id FROM scan_stations WHERE name='Ana Giriş'").get().id
    const r = await request(app).get(`/api/stations/recent-events?station_id=${anaGirisId}&limit=50`).set(auth(token))
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThan(0)
    expect(r.body.every(e => e.station_name === 'Ana Giriş')).toBe(true)
  })

  it('recent-events only_fail=1 ok olmayanları döner', async () => {
    const r = await request(app).get('/api/stations/recent-events?only_fail=1&limit=50').set(auth(token))
    expect(r.status).toBe(200)
    expect(r.body.every(e => e.result !== 'ok')).toBe(true)
  })
})
