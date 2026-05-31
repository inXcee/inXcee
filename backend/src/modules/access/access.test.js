import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

const auth = (t) => ({ Authorization: `Bearer ${t}` })
let token, entryKey, exitKey
let pIn, pOut, pBlack
const uidIn = 'NFC-P-IN', uidOut = 'NFC-P-OUT', uidBlack = 'NFC-P-BLACK'

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  const mkP = (name, black = 0) => {
    db.prepare('INSERT INTO personnel(full_name,is_blacklisted,blacklist_reason) VALUES(?,?,?)')
      .run(name, black, black ? 'Kavga' : null)
    return db.prepare('SELECT id FROM personnel WHERE full_name=?').get(name).id
  }
  pIn = mkP('Icerde Kisi'); pOut = mkP('Disarda Kisi'); pBlack = mkP('Kara Liste', 1)

  const issue = async (pid, uid) => {
    const c = await request(app).post(`/api/cards/personnel/${pid}/issue`).set(auth(token)).send({ card_type: 'access' })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: uid })
  }
  await issue(pIn, uidIn); await issue(pOut, uidOut); await issue(pBlack, uidBlack)

  entryKey = (await request(app).post('/api/stations').set(auth(token)).send({ name: 'Giris', station_type: 'entry' })).body.api_key
  exitKey = (await request(app).post('/api/stations').set(auth(token)).send({ name: 'Cikis', station_type: 'exit' })).body.api_key

  // pIn → içeride (sadece giriş). pOut → giriş + çıkış (dışarıda).
  await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: uidIn })
  await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: uidOut })
  await request(app).post('/api/stations/scan').set('X-Station-Key', exitKey).send({ raw_uid: uidOut })
})

describe('access — presence (kampüste kim var)', () => {
  it('GET /access/presence içerdekini listeler, çıkanı listelemez', async () => {
    const r = await request(app).get('/api/access/presence').set(auth(token))
    expect(r.status).toBe(200)
    const ids = r.body.on_campus.map(x => x.holder_id)
    expect(ids).toContain(pIn)
    expect(ids).not.toContain(pOut)
    expect(r.body.count).toBe(r.body.on_campus.length)
    const me = r.body.on_campus.find(x => x.holder_id === pIn)
    expect(me.full_name).toBe('Icerde Kisi')
  })

  it('yetkisiz rol 403', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const r = await request(app).get('/api/access/presence').set(auth(t))
    expect(r.status).toBe(403)
  })
})

describe('access — kara liste alarmı', () => {
  it('kara listedeki personel giriş okutursa alarm + kritik bildirim', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: uidBlack })
    expect(r.body.result).toBe('alarm')
    expect(r.body.holder.full_name).toBe('Kara Liste')
    const ev = getDB().prepare("SELECT * FROM access_events WHERE holder_type='personnel' AND holder_id=? ORDER BY id DESC").get(pBlack)
    expect(ev.result).toBe('alarm')
    const notif = getDB().prepare("SELECT * FROM notifications WHERE message LIKE '%Kara Liste%' AND severity='critical'").get()
    expect(notif).toBeTruthy()
  })

  it('kara liste girişi presence içine sayılmaz (ok değil)', async () => {
    const r = await request(app).get('/api/access/presence').set(auth(token))
    expect(r.body.on_campus.map(x => x.holder_id)).not.toContain(pBlack)
  })
})

describe('access — kara liste alarmı e-posta kanalı (Faz 6.3)', () => {
  it('alarm yöneticilere email.send job kuyruğuna ekler', async () => {
    const db = getDB()
    // En az bir campus_manager'ın e-postası olduğundan emin ol (seed zaten verir)
    db.prepare("UPDATE users SET email='mgr@example.com' WHERE role='campus_manager' AND (email IS NULL OR email='')").run()
    const mgrEmail = db.prepare("SELECT email FROM users WHERE role='campus_manager' AND email IS NOT NULL AND email!='' LIMIT 1").get().email
    db.prepare('INSERT INTO personnel(full_name,is_blacklisted,blacklist_reason) VALUES(?,1,?)').run('Mail Alarm', 'Tehdit')
    const pid = db.prepare("SELECT id FROM personnel WHERE full_name='Mail Alarm'").get().id
    const c = await request(app).post(`/api/cards/personnel/${pid}/issue`).set(auth(token)).send({ card_type: 'access' })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: 'NFC-MAILALARM' })
    await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'NFC-MAILALARM' })
    const job = db.prepare("SELECT * FROM job_queue WHERE type='email.send' ORDER BY id DESC").get()
    expect(job).toBeTruthy()
    const payload = JSON.parse(job.payload)
    expect(payload.to).toContain(mgrEmail)
    expect(payload.subject).toContain('Mail Alarm')
  })
})

describe('access — anomaliler (çıkışsız uzun süre)', () => {
  it('GET /access/anomalies 16+ saattir içerdekini no_exit işaretler', async () => {
    const db = getDB()
    db.prepare("UPDATE access_events SET scanned_at = datetime('now','-20 hours') WHERE holder_type='personnel' AND holder_id=? AND event_type='entry'").run(pIn)
    const r = await request(app).get('/api/access/anomalies').set(auth(token))
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.no_exit)).toBe(true)
    expect(r.body.no_exit.some(x => x.holder_id === pIn)).toBe(true)
  })
})

describe('access — anti-passback (Faz 5b)', () => {
  it('art arda iki giriş (çıkışsız) → passback anomalisi', async () => {
    const db = getDB()
    db.prepare('INSERT INTO personnel(full_name) VALUES(?)').run('Passback Kisi')
    const pid = db.prepare("SELECT id FROM personnel WHERE full_name='Passback Kisi'").get().id
    const c = await request(app).post(`/api/cards/personnel/${pid}/issue`).set(auth(token)).send({ card_type: 'access' })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: 'NFC-PASS' })
    await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'NFC-PASS' })
    await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'NFC-PASS' })
    const r = await request(app).get('/api/access/anomalies').set(auth(token))
    expect(Array.isArray(r.body.passback)).toBe(true)
    const hit = r.body.passback.find(x => x.holder_id === pid)
    expect(hit).toBeTruthy()
    expect(hit.last_dir).toBe('entry')
  })
})
