// Ajan anahtarına özel finans kasası izni (migration 128) — bkz. docs/hermes-entegrasyon.md → "Kasa izni".
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { createAgentKey, setAgentKeyKasa, revokeAgentKey } from '../../shared/auth/agentKeys.js'

let ownerToken, managerToken, ownerId, managerId
let plain, reader, writer
const login = async (username) => (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token
const as = (req, token) => req.set('Authorization', `Bearer ${token}`)
const HIDDEN = { error: 'Bulunamadı' }

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const db = getDB()
  db.prepare(`INSERT INTO users(username, password_hash, role, full_name)
    SELECT 'patron', password_hash, 'campus_manager', 'Patron' FROM users WHERE username='mudur'`).run()
  db.prepare("UPDATE users SET is_owner=1 WHERE username='patron'").run()
  ownerId = db.prepare("SELECT id FROM users WHERE username='patron'").get().id
  managerId = db.prepare("SELECT id FROM users WHERE username='mudur'").get().id
  ownerToken = await login('patron')
  managerToken = await login('mudur')
  // Canlıdaki gibi: Hermes'in anahtarı sahip OLMAYAN bir müdür hesabına bağlı.
  plain = createAgentKey({ name: 'duz', userId: managerId })
  reader = createAgentKey({ name: 'hermes-okur', userId: managerId })
  writer = createAgentKey({ name: 'hermes-yazar', userId: managerId })
  setAgentKeyKasa(reader.id, 'read', ownerId)
  setAgentKeyKasa(writer.id, 'write', ownerId)
})

describe('kasa izni — erişim', () => {
  it('izinsiz anahtar 404 alır; whoami kasadan söz etmez', async () => {
    expect((await as(request(app).get('/api/pf/state'), plain.key)).body).toEqual(HIDDEN)
    expect((await as(request(app).get('/api/agent/whoami'), plain.key)).body.agent).toEqual({ name: 'duz', access: 'write' })
  })

  it('okur izni: okur, yazamaz; whoami izni gösterir', async () => {
    expect((await as(request(app).get('/api/pf/state'), reader.key)).status).toBe(200)
    const put = await as(request(app).put('/api/pf/state/test-store'), reader.key).send({ data: { a: 1 }, base_version: 0 })
    expect(put.status).toBe(404)
    expect((await as(request(app).get('/api/agent/whoami'), reader.key)).body.agent.kasa).toBe('read')
  })

  it('yazar izni: yazar, okur; kayıt aktörü ajan adıyla düşer, firma denetim günlüğüne düşmez', async () => {
    const put = await as(request(app).put('/api/pf/state/test-store'), writer.key).send({ data: { a: 1 }, base_version: 0 })
    expect(put.status).toBe(201)
    const got = await as(request(app).get('/api/pf/state/test-store'), writer.key)
    expect(got.body).toMatchObject({ version: 1, actor: 'ajan:hermes-yazar', data: { a: 1 } })
    await new Promise(r => setTimeout(r, 20))
    expect(getDB().prepare("SELECT COUNT(*) n FROM audit_log WHERE action LIKE '%/pf/%'").get().n).toBe(0)
  })

  it('geri yükleme ve /me yazar izniyle de kapalı', async () => {
    expect((await as(request(app).post('/api/pf/state/test-store/restore'), writer.key).send({ version: 1 })).status).toBe(404)
    expect((await as(request(app).get('/api/pf/me'), writer.key)).status).toBe(404)
  })

  it('izni veren sahiplikten düşerse izin kendiliğinden geçersiz olur', async () => {
    getDB().prepare('UPDATE users SET is_owner=0 WHERE id=?').run(ownerId)
    expect((await as(request(app).get('/api/pf/state'), reader.key)).body).toEqual(HIDDEN)
    expect((await as(request(app).get('/api/agent/whoami'), reader.key)).body.agent.kasa).toBeUndefined()
    getDB().prepare('UPDATE users SET is_owner=1 WHERE id=?').run(ownerId)
    expect((await as(request(app).get('/api/pf/state'), reader.key)).status).toBe(200)
  })

  it('iptal edilen anahtar kasaya da giremez', async () => {
    const k = createAgentKey({ name: 'gecici', userId: managerId })
    setAgentKeyKasa(k.id, 'read', ownerId)
    revokeAgentKey(k.id)
    expect((await as(request(app).get('/api/pf/state'), k.key)).status).toBe(401)
    expect(() => setAgentKeyKasa(k.id, 'read', ownerId)).toThrow(/İptal/)
  })
})

describe('kasa izni — yönetim', () => {
  it('sahip olmayan izin veremez (fonksiyon ve web ucu); web ucu ona 404 döner', async () => {
    expect(() => setAgentKeyKasa(plain.id, 'read', managerId)).toThrow(/sahibi/)
    const r = await as(request(app).patch(`/api/agent/keys/${plain.id}/kasa`), managerToken).send({ access: 'read' })
    expect(r.status).toBe(404)
  })

  it('ajan kendi kasa iznini değiştiremez', async () => {
    const r = await as(request(app).patch(`/api/agent/keys/${reader.id}/kasa`), reader.key).send({ access: 'write' })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('AGENT_BLOCKED')
  })

  it('sahip web ucundan verir ve kaldırır; geçersiz değer 400', async () => {
    expect((await as(request(app).patch(`/api/agent/keys/${plain.id}/kasa`), ownerToken).send({ access: 'admin' })).status).toBe(400)
    const on = await as(request(app).patch(`/api/agent/keys/${plain.id}/kasa`), ownerToken).send({ access: 'read' })
    expect(on.body).toEqual({ id: plain.id, kasa_access: 'read' })
    expect((await as(request(app).get('/api/pf/state'), plain.key)).status).toBe(200)
    await as(request(app).patch(`/api/agent/keys/${plain.id}/kasa`), ownerToken).send({ access: null })
    expect((await as(request(app).get('/api/pf/state'), plain.key)).status).toBe(404)
  })

  it('anahtar listesinde kasa sütunu yalnız sahibe görünür', async () => {
    const mine = (await as(request(app).get('/api/agent/keys'), ownerToken)).body.find(k => k.id === reader.id)
    expect(mine.kasa_access).toBe('read')
    const theirs = (await as(request(app).get('/api/agent/keys'), managerToken)).body.find(k => k.id === reader.id)
    expect(theirs).not.toHaveProperty('kasa_access')
    expect(theirs).not.toHaveProperty('kasa_granted_at')
  })
})
