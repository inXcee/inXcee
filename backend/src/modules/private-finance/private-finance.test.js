import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { createApiKey, revokeApiKey, HISTORY_KEEP, vaultPath } from './vault.js'

let ownerToken, managerToken, supervisorToken, ownerId, managerId
const login = async (username) => (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  // Canlıdaki gibi: aynı rolde iki müdür, yalnız biri sahip.
  db.prepare(`INSERT INTO users(username, password_hash, role, full_name)
    SELECT 'patron', password_hash, 'campus_manager', 'Patron' FROM users WHERE username='mudur'`).run()
  db.prepare("UPDATE users SET is_owner=1 WHERE username='patron'").run()
  ownerId = db.prepare("SELECT id FROM users WHERE username='patron'").get().id
  managerId = db.prepare("SELECT id FROM users WHERE username='mudur'").get().id
  ownerToken = await login('patron')
  managerToken = await login('mudur')
  supervisorToken = await login('vardiya')
})

const as = (token, r) => r.set('Authorization', `Bearer ${token}`)

describe('Özel finans kasası — görünmezlik', () => {
  it('oturumsuz, müdür ve vardiya her uçta 404 alır (403/401 değil)', async () => {
    for (const token of [null, managerToken, supervisorToken]) {
      for (const [m, url] of [['get', '/api/pf/me'], ['get', '/api/pf/state'], ['get', '/api/pf/state/finance-storage'],
        ['put', '/api/pf/state/finance-storage'], ['get', '/api/pf/nope']]) {
        const r = token ? await as(token, request(app)[m](url)).send({ data: {} }) : await request(app)[m](url).send({ data: {} })
        expect(r.status, `${m} ${url}`).toBe(404)
        expect(r.body).toEqual({ error: 'Bulunamadı' })
      }
    }
  })

  it('gate: doğrudan çağrı 404; nginx alt isteğinde sahip 204, müdür 403, oturumsuz 401', async () => {
    expect((await as(ownerToken, request(app).get('/api/pf/gate'))).status).toBe(404)
    const gate = t => (t ? as(t, request(app).get('/api/pf/gate')) : request(app).get('/api/pf/gate')).set('X-Original-URI', '/kasa/')
    expect((await gate(ownerToken)).status).toBe(204)
    expect((await gate(managerToken)).status).toBe(403)
    expect((await gate(null)).status).toBe(401)
  })

  it('sahip /me ile kendini görür; yanıtlar önbelleğe alınmaz', async () => {
    const r = await as(ownerToken, request(app).get('/api/pf/me'))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ owner: true, username: 'patron' })
    expect(r.headers['cache-control']).toBe('no-store')
  })

  it('pasif sahip hesabı 404', async () => {
    getDB().prepare('UPDATE users SET is_owner=0 WHERE id=?').run(ownerId)
    expect((await as(ownerToken, request(app).get('/api/pf/me'))).status).toBe(404)
    getDB().prepare('UPDATE users SET is_owner=1 WHERE id=?').run(ownerId)
  })
})

describe('Özel finans kasası — store senkronu', () => {
  const blob = { state: { accounts: [{ id: 'a1', name: 'Enpara', balance: 1500, currency: 'TRY' }], transactions: [] }, version: 1 }

  it('ilk yazım v1; aynı veri tekrar yazılınca sürüm artmaz', async () => {
    const put = await as(ownerToken, request(app).put('/api/pf/state/finance-storage')).send({ data: blob, base_version: 0, device_id: 'web' })
    expect(put.status).toBe(201)
    expect(put.body.version).toBe(1)
    const same = await as(ownerToken, request(app).put('/api/pf/state/finance-storage')).send({ data: blob, base_version: 1 })
    expect(same.status).toBe(200)
    expect(same.body).toMatchObject({ version: 1, unchanged: true })
    const get = await as(ownerToken, request(app).get('/api/pf/state/finance-storage'))
    expect(get.body).toMatchObject({ version: 1, device_id: 'web', actor: 'kullanıcı:patron', data: blob })
  })

  it('veri birebir saklanır — HTML/boşluk temizliği uygulanmaz', async () => {
    const odd = { note: '  <b>a < b > c</b>  ' }
    await as(ownerToken, request(app).put('/api/pf/state/odd')).send({ data: odd, base_version: 0 })
    expect((await as(ownerToken, request(app).get('/api/pf/state/odd'))).body.data).toEqual(odd)
  })

  it('eski sürüme yazım 409 + güncel sürüm döner; force ile ezilir', async () => {
    const v2 = await as(ownerToken, request(app).put('/api/pf/state/finance-storage')).send({ data: { ...blob, version: 2 }, base_version: 1 })
    expect(v2.body.version).toBe(2)
    const stale = await as(ownerToken, request(app).put('/api/pf/state/finance-storage')).send({ data: { x: 1 }, base_version: 1 })
    expect(stale.status).toBe(409)
    expect(stale.body.current_version).toBe(2)
    const forced = await as(ownerToken, request(app).put('/api/pf/state/finance-storage')).send({ data: { x: 1 }, base_version: 1, force: true })
    expect(forced.body.version).toBe(3)
  })

  it('liste + geçmiş + geri yükleme', async () => {
    const list = (await as(ownerToken, request(app).get('/api/pf/state'))).body.stores
    expect(list.map(s => s.store_key)).toEqual(['finance-storage', 'odd'])
    const hist = (await as(ownerToken, request(app).get('/api/pf/state/finance-storage/history'))).body.versions
    expect(hist.map(h => h.version)).toEqual([2, 1])
    const restored = await as(ownerToken, request(app).post('/api/pf/state/finance-storage/restore')).send({ version: 1 })
    expect(restored.body.version).toBe(4)
    expect((await as(ownerToken, request(app).get('/api/pf/state/finance-storage'))).body.data).toEqual(blob)
  })

  it(`geçmiş son ${HISTORY_KEEP} sürümle sınırlı`, async () => {
    let v = 0
    for (let i = 0; i < HISTORY_KEEP + 5; i++) {
      v = (await as(ownerToken, request(app).put('/api/pf/state/churn')).send({ data: { i }, base_version: v })).body.version
    }
    const hist = (await as(ownerToken, request(app).get('/api/pf/state/churn/history'))).body.versions
    expect(hist).toHaveLength(HISTORY_KEEP)
    expect(hist[0].version).toBe(v - 1)
  })

  it('geçersiz store anahtarı 400; 5mb üstü veri kabul edilir', async () => {
    expect((await as(ownerToken, request(app).get('/api/pf/state/Bad%20Key'))).status).toBe(400)
    const big = { blob: 'x'.repeat(6 * 1024 * 1024) }
    const r = await as(ownerToken, request(app).put('/api/pf/state/big')).send({ data: big, base_version: 0 })
    expect(r.status).toBe(201)
  })
})

describe('Özel finans kasası — API anahtarı (Hermes)', () => {
  it('read anahtarı okur ama yazamaz; write anahtarı yazar; iptal edilen 404', async () => {
    const ro = createApiKey('hermes-okur', ['read'])
    const rw = createApiKey('hermes', ['read', 'write'])
    const key = k => r => r.set('X-PF-Key', k.secret)
    expect((await key(ro)(request(app).get('/api/pf/state'))).status).toBe(200)
    expect((await key(ro)(request(app).put('/api/pf/state/hermes-test')).send({ data: 1, base_version: 0 })).status).toBe(404)
    const w = await key(rw)(request(app).put('/api/pf/state/hermes-test')).send({ data: 1, base_version: 0 })
    expect(w.status).toBe(201)
    expect((await key(rw)(request(app).get('/api/pf/state/hermes-test'))).body.actor).toBe('anahtar:hermes')
    expect((await key(rw)(request(app).get('/api/pf/me'))).status).toBe(404) // anahtar kullanıcı oturumu değildir
    expect((await key(rw)(request(app).post('/api/pf/state/hermes-test/restore')).send({ version: 1 })).status).toBe(404)
    revokeApiKey(rw.id)
    expect((await key(rw)(request(app).get('/api/pf/state'))).status).toBe(404)
    expect((await request(app).get('/api/pf/state').set('X-PF-Key', 'pfk_uydurma')).status).toBe(404)
  })
})

describe('Sahip hesabı başka müdürce değiştirilemez', () => {
  it('şifre, rol, PIN, silme, askıya alma 403; sahip kendi şifresini değiştirebilir', async () => {
    const m = r => as(managerToken, r)
    expect((await m(request(app).patch(`/api/users/${ownerId}/password`)).send({ password: 'YeniSifre!2026x' })).status).toBe(403)
    expect((await m(request(app).put(`/api/users/${ownerId}`)).send({ role: 'housekeeper', full_name: 'X' })).status).toBe(403)
    expect((await m(request(app).patch(`/api/users/${ownerId}/mobile-pin`)).send({ pin: '123456' })).status).toBe(403)
    expect((await m(request(app).delete(`/api/users/${ownerId}`))).status).toBe(403)
    expect((await m(request(app).post(`/api/system/users/${ownerId}/suspend`)).send({ reason: 'x' })).status).toBe(403)
    expect((await as(ownerToken, request(app).get('/api/pf/me'))).status).toBe(200)

    const self = await as(ownerToken, request(app).patch(`/api/users/${ownerId}/password`)).send({ password: 'YeniSifre!2026x' })
    expect(self.status).toBe(200)
    // sahip normal kullanıcıları yönetmeye devam eder
    const other = await as(ownerToken, request(app).patch(`/api/users/${managerId}/mobile-pin`)).send({ pin: null })
    expect(other.status).not.toBe(403)
  })
})

describe('Kasa dosya yolu', () => {
  it('ortamlar aynı klasörde olsa da ayrı kasa açar', () => {
    const saved = process.env.DB_PATH
    try {
      process.env.DB_PATH = '/var/data/yys.db'
      expect(vaultPath().replaceAll('\\', '/')).toMatch(/\/var\/data\/finance-vault\.db$/)
      process.env.DB_PATH = '/var/data/yys-staging.db'
      expect(vaultPath().replaceAll('\\', '/')).toMatch(/\/var\/data\/finance-vault\.yys-staging\.db$/)
    } finally {
      process.env.DB_PATH = saved
    }
  })
})
