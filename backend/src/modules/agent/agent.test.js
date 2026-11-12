import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { createAgentKey, revokeAgentKey, AGENT_KEY_PREFIX } from '../../shared/auth/agentKeys.js'
import { readSource } from './catalog.js'

let managerToken, supervisorToken
let managerId, supervisorId
let writeKey, readKey, supervisorKey

const login = async (username) => (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token
const as = (req, token) => req.set('Authorization', `Bearer ${token}`)
const userId = username => getDB().prepare('SELECT id FROM users WHERE username=?').get(username).id

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = await login('mudur')
  supervisorToken = await login('vardiya')
  managerId = userId('mudur')
  supervisorId = userId('vardiya')
  writeKey = createAgentKey({ name: 'hermes', userId: managerId }).key
  readKey = createAgentKey({ name: 'rapor', userId: managerId, access: 'read' }).key
  supervisorKey = createAgentKey({ name: 'vardiya-botu', userId: supervisorId }).key
})

describe('ajan anahtarı — kimlik', () => {
  it('anahtar bağlı kullanıcının rolüyle normal uçları çağırır', async () => {
    const who = await as(request(app).get('/api/agent/whoami'), writeKey)
    expect(who.status).toBe(200)
    expect(who.body.user).toMatchObject({ username: 'mudur', role: 'campus_manager' })
    expect(who.body.agent).toEqual({ name: 'hermes', access: 'write' })
    expect(who.body.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // müdüre özel bir uç: JWT olmadan, yalnız anahtarla
    expect((await as(request(app).get('/api/users'), writeKey)).status).toBe(200)
    expect((await as(request(app).get('/api/auth/me'), writeKey)).body.user.username).toBe('mudur')
  })

  it('rol kuralı aynen uygulanır: vardiya amirine bağlı anahtar müdür ucuna giremez', async () => {
    expect((await as(request(app).get('/api/users'), supervisorKey)).status).toBe(403)
    expect((await as(request(app).get('/api/housekeeping/tasks'), supervisorKey)).status).toBe(200)
  })

  it('geçersiz, iptal edilmiş ve süresi dolmuş anahtar 401 alır', async () => {
    const bogus = await as(request(app).get('/api/agent/whoami'), `${AGENT_KEY_PREFIX}olmayan-anahtar`)
    expect(bogus.status).toBe(401)
    expect(bogus.body.code).toBe('AGENT_KEY_INVALID')

    const temp = createAgentKey({ name: 'gecici', userId: managerId })
    expect((await as(request(app).get('/api/agent/whoami'), temp.key)).status).toBe(200)
    expect(revokeAgentKey(temp.id)).toBe(true)
    expect((await as(request(app).get('/api/agent/whoami'), temp.key)).status).toBe(401)

    const expired = createAgentKey({ name: 'eski', userId: managerId, expiresAt: '2020-01-01T00:00:00Z' })
    expect((await as(request(app).get('/api/agent/whoami'), expired.key)).status).toBe(401)
  })

  it('askıya alınan kullanıcının anahtarı ölür', async () => {
    const db = getDB()
    const info = db.prepare(`INSERT INTO users(username, password_hash, role, full_name) VALUES('gecici_amir','x','shift_supervisor','Geçici Amir')`).run()
    const k = createAgentKey({ name: 'askida', userId: Number(info.lastInsertRowid) })
    expect((await as(request(app).get('/api/agent/whoami'), k.key)).status).toBe(200)
    db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(info.lastInsertRowid)
    expect((await as(request(app).get('/api/agent/whoami'), k.key)).status).toBe(401)
  })

  it('ham anahtar veritabanında saklanmaz', () => {
    const rows = getDB().prepare('SELECT key_hash, key_prefix FROM agent_api_keys').all()
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.key_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(writeKey.startsWith(r.key_prefix) ? r.key_prefix.length : 0).toBeLessThan(writeKey.length / 2)
    }
  })
})

describe('ajan anahtarı — yazma, salt-okur ve kapalı uçlar', () => {
  it('yazma anahtarı değişiklik yapar ve işlem denetim günlüğüne düşer', async () => {
    const res = await as(request(app).patch('/api/housekeeping/generation'), writeKey).send({ enabled: false })
    expect(res.status).toBe(200)
    await new Promise(r => setTimeout(r, 20))
    const row = getDB().prepare(`SELECT * FROM audit_log WHERE module='agent' AND action='PATCH /api/housekeeping/generation'`).get()
    expect(row).toBeTruthy()
    expect(row.user_id).toBe(managerId)
    expect(row.detail).toContain('anahtar=hermes')
    expect(row.detail).toContain('durum=200')
  })

  it('salt-okur anahtar okur ama yazamaz', async () => {
    expect((await as(request(app).get('/api/housekeeping/generation'), readKey)).status).toBe(200)
    const res = await as(request(app).patch('/api/housekeeping/generation'), readKey).send({ enabled: true })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('AGENT_READ_ONLY')
  })

  it('kimlik, anahtar, kişisel alan ve geri yükleme uçları ajana kapalıdır', async () => {
    const blocked = [
      ['patch', '/api/auth/password'],
      ['post', '/api/auth/logout'],
      ['post', '/api/AUTH/refresh'],           // Express yolu büyük/küçük harf ayırmaz; kapı da ayırmamalı
      ['get', '/api/agent/keys'],
      ['post', '/api/agent/keys'],
      ['get', '/api/hermes/status'],
      ['post', '/api/backup/restore'],
      ['delete', '/api/backup/yys-2026.db'],
    ]
    for (const [method, path] of blocked) {
      const res = await as(request(app)[method](path), writeKey).send({})
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(res.body.code).toBe('AGENT_BLOCKED')
    }
  })

  it('kasa izni olmayan anahtar özel kasayı hiç göremez (403 değil 404)', async () => {
    for (const [method, path] of [['get', '/api/pf/state'], ['put', '/api/pf/state/finance-storage'], ['get', '/api/PF/state']]) {
      const res = await as(request(app)[method](path), writeKey).send({})
      expect(res.status, `${method} ${path}`).toBe(404)
      expect(res.body).toEqual({ error: 'Bulunamadı' })
    }
  })

  it('normal oturumlar ön kapıdan etkilenmez', async () => {
    expect((await as(request(app).get('/api/agent/keys'), managerToken)).status).toBe(200)
    expect((await as(request(app).get('/api/agent/whoami'), supervisorToken)).body.agent).toBeNull()
    expect((await request(app).get('/api/agent/whoami')).status).toBe(401)
  })
})

describe('anahtar yönetimi (web oturumu)', () => {
  it('müdür anahtar oluşturur, listeler, iptal eder; anahtar yalnız bir kez görünür', async () => {
    const created = await as(request(app).post('/api/agent/keys'), managerToken).send({ name: 'web-anahtari', access: 'read' })
    expect(created.status).toBe(201)
    expect(created.body.key.startsWith(AGENT_KEY_PREFIX)).toBe(true)
    expect(created.body.user.username).toBe('mudur')

    const list = await as(request(app).get('/api/agent/keys'), managerToken)
    const row = list.body.find(k => k.id === created.body.id)
    expect(row).toMatchObject({ name: 'web-anahtari', access: 'read', revoked_at: null })
    expect(JSON.stringify(list.body)).not.toContain(created.body.key)
    expect(row.key_hash).toBeUndefined()

    expect((await as(request(app).delete(`/api/agent/keys/${created.body.id}`), managerToken)).status).toBe(200)
    expect((await as(request(app).delete(`/api/agent/keys/${created.body.id}`), managerToken)).status).toBe(404)
    expect((await as(request(app).get('/api/agent/whoami'), created.body.key)).status).toBe(401)
  })

  it('vardiya amiri anahtar yönetemez; geçersiz gövde 400', async () => {
    expect((await as(request(app).get('/api/agent/keys'), supervisorToken)).status).toBe(403)
    expect((await as(request(app).post('/api/agent/keys'), supervisorToken).send({ name: 'x1' })).status).toBe(403)
    expect((await as(request(app).post('/api/agent/keys'), managerToken).send({ name: 'x', access: 'admin' })).status).toBe(400)
    expect((await as(request(app).post('/api/agent/keys'), managerToken).send({ name: 'yok', user_id: 999999 })).status).toBe(404)
  })

  it('ajan etkinliği müdüre listelenir', async () => {
    const res = await as(request(app).get('/api/agent/activity'), managerToken)
    expect(res.status).toBe(200)
    expect(res.body.some(r => r.action === 'PATCH /api/housekeeping/generation')).toBe(true)
  })
})

describe('katalog', () => {
  it('çalışan uygulamadaki uçları yetki kuralıyla listeler', async () => {
    const res = await as(request(app).get('/api/agent/catalog?limit=500&module=housekeeping'), writeKey)
    expect(res.status).toBe(200)
    const gen = res.body.items.find(i => i.method === 'PATCH' && i.path === '/api/housekeeping/generation')
    expect(gen).toMatchObject({ access: 'role', roles: ['campus_manager', 'shift_supervisor'], callable: true })
    expect(gen.source).toBe('modules/housekeeping/routes.js')
    const modules = await as(request(app).get('/api/agent/modules'), writeKey)
    expect(modules.body.find(m => m.module === 'water').endpoints).toBeGreaterThan(20)
  })

  it('Türkçe sözcükle arar, yoldaki İngilizce karşılığı bulur', async () => {
    const res = await as(request(app).get('/api/agent/catalog').query({ q: 'su dağıtım', limit: 5 }), writeKey)
    expect(res.body.items[0].path).toBe('/api/water/distribute')
    expect(res.body.items[0].description).toContain('Dağıtım')
    const izin = await as(request(app).get('/api/agent/catalog').query({ q: 'izin', method: 'post' }), writeKey)
    expect(izin.body.items.some(i => i.path === '/api/shifts/leave')).toBe(true)
  })

  it('callable anahtarın rolüne göre hesaplanır; kapalı ve kiosk uçları işaretlenir', async () => {
    const q = { q: '/api/users', limit: 50 }
    const mgr = await as(request(app).get('/api/agent/catalog').query(q), writeKey)
    const sup = await as(request(app).get('/api/agent/catalog').query(q), supervisorKey)
    const pick = body => body.items.find(i => i.method === 'GET' && i.path === '/api/users')
    expect(pick(mgr.body).callable).toBe(true)
    expect(pick(sup.body).callable).toBe(false)
    const only = await as(request(app).get('/api/agent/catalog').query({ ...q, only_callable: '1' }), supervisorKey)
    expect(pick(only.body)).toBeUndefined()

    const auth = await as(request(app).get('/api/agent/catalog').query({ q: '/api/auth/password' }), writeKey)
    const pw = auth.body.items.find(i => i.path === '/api/auth/password')
    expect(pw.callable).toBe(false)
    expect(pw.agent_blocked).toBeTruthy()

    const kiosk = await as(request(app).get('/api/agent/catalog').query({ q: '/api/avs-self-service/board', limit: 5 }), writeKey)
    expect(kiosk.body.items[0]).toMatchObject({ access: 'kiosk', callable: false })
  })

  it('şemalı uçta gövde şeması JSON Schema olarak gelir', async () => {
    const res = await as(request(app).get('/api/agent/catalog').query({ q: '/api/agent/keys', method: 'POST', schema: '1' }), managerToken)
    const item = res.body.items.find(i => i.path === '/api/agent/keys')
    expect(item.has_schema).toBe(true)
    expect(item.schemas[0].in).toBe('body')
    expect(item.schemas[0].schema.properties.access.enum).toEqual(['read', 'write'])
  })

  it('uç ayrıntısı route kodunu döner; yalnız ajan ve müdür', async () => {
    const q = { method: 'post', path: '/api/water/distribute/batch' }
    const res = await as(request(app).get('/api/agent/catalog/endpoint').query(q), writeKey)
    expect(res.status).toBe(200)
    expect(res.body.source).toBe('modules/water/routes.js')
    expect(res.body.code).toContain("waterRouter.post('/distribute/batch'")
    expect(res.body.code).toContain('Toplu dağıtım')
    expect(res.body.code).not.toContain("waterRouter.post('/distribute/parse'")
    expect((await as(request(app).get('/api/agent/catalog/endpoint').query(q), supervisorToken)).status).toBe(403)
    expect((await as(request(app).get('/api/agent/catalog/endpoint').query({ method: 'GET', path: '/api/yok' }), writeKey)).status).toBe(404)
  })
})

describe('kaynak ve belgeler', () => {
  it('kaynak okuma yalnız src altındaki .js dosyalarına izin verir', async () => {
    const ok = await as(request(app).get('/api/agent/source').query({ file: 'modules/water/units.js', lines: 20 }), writeKey)
    expect(ok.status).toBe(200)
    expect(ok.body.code.split('\n').length).toBeLessThanOrEqual(20)
    const grep = await as(request(app).get('/api/agent/source').query({ file: 'modules/agent/gate.js', grep: 'AGENT_READ_ONLY' }), writeKey)
    expect(grep.body.matches.length).toBe(1)
    for (const file of ['../../.env', '../package.json', 'modules/../../../.env', '/etc/passwd', 'shared/db/migrations/127_agent_api_keys.sql']) {
      expect(readSource(file), file).toBeNull()
      expect((await as(request(app).get('/api/agent/source').query({ file }), writeKey)).status).toBe(404)
    }
    expect((await as(request(app).get('/api/agent/source').query({ file: 'modules/water/units.js' }), supervisorToken)).status).toBe(403)
  })

  it('modül belgeleri listelenir ve okunur', async () => {
    const list = await as(request(app).get('/api/agent/docs'), writeKey)
    expect(list.body.some(d => d.name === 'water-module')).toBe(true)
    const doc = await as(request(app).get('/api/agent/docs/water-module'), writeKey)
    expect(doc.status).toBe(200)
    expect(doc.headers['content-type']).toContain('text/markdown')
    expect((await as(request(app).get('/api/agent/docs/..%2F..%2FCLAUDE'), writeKey)).status).toBe(404)
  })
})
