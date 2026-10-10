import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let supervisor
let housekeeper
let roomId
const login = async (u) => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
const auth = (t) => ({ Authorization: `Bearer ${t}` })
const OVERRIDE = { card_override_reason: 'Defter kaydı (Telegram)' }

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  supervisor = await login('vardiya')
  housekeeper = await login('meydanci')
  roomId = getDB().prepare('SELECT id FROM rooms LIMIT 1').get().id
  const set = getDB().prepare(`INSERT INTO laundry_global_settings(key, value) VALUES(?, '1')
                               ON CONFLICT(key) DO UPDATE SET value='1'`)
  set.run('card_required_intake'); set.run('card_required_delivery')
})

describe('Çamaşır defter akışı (vardiya amiri / Telegram)', () => {
  it('kart zorunluyken gerekçeyle torba açar → hazır → teslim → geri al', async () => {
    const noCard = await request(app).post('/api/laundry/items').set(auth(supervisor)).send({ room_id: roomId, item_count: 2 })
    expect(noCard.status).toBe(409)

    const created = await request(app).post('/api/laundry/items').set(auth(supervisor))
      .send({ room_id: roomId, item_count: 2, notes: 'Defter', ...OVERRIDE })
    expect(created.status).toBe(201)
    const id = created.body.id
    expect(created.body.status).toBe('dirty')

    const ready = await request(app).patch(`/api/laundry/items/${id}/mark-ready`).set(auth(supervisor)).send({ note: 'Telegram' })
    expect(ready.status).toBe(200)
    expect(ready.body.status).toBe('ready')
    const hist = getDB().prepare('SELECT notes FROM laundry_history WHERE item_id=? AND to_status=?').get(id, 'ready')
    expect(hist.notes).toContain('Defter')

    const again = await request(app).patch(`/api/laundry/items/${id}/mark-ready`).set(auth(supervisor)).send({})
    expect(again.status).toBe(400)

    const delivered = await request(app).patch(`/api/laundry/items/${id}/deliver`).set(auth(supervisor))
      .send({ delivered_to: 'Oda sakini', ...OVERRIDE })
    expect(delivered.status).toBe(200)
    expect(delivered.body.status).toBe('delivered')

    const back = await request(app).patch(`/api/laundry/items/${id}/revert`).set(auth(supervisor)).send({ target_status: 'ready' })
    expect(back.status).toBe(200)
    expect(back.body.status).toBe('ready')

    const scans = getDB().prepare("SELECT COUNT(*) n FROM laundry_card_scans WHERE override_reason=?").get(OVERRIDE.card_override_reason)
    expect(scans.n).toBeGreaterThanOrEqual(2)
  })

  it('meydancı defter işlemi yapamaz; silme yetkisi vardiya amirine açılmadı', async () => {
    const r = await request(app).post('/api/laundry/items').set(auth(housekeeper)).send({ room_id: roomId, item_count: 1, ...OVERRIDE })
    expect(r.status).toBe(403)
    const created = await request(app).post('/api/laundry/items').set(auth(supervisor)).send({ room_id: roomId, item_count: 1, ...OVERRIDE })
    const del = await request(app).delete(`/api/laundry/items/${created.body.id}`).set(auth(supervisor))
    expect(del.status).toBe(403)
  })

  it('kendi açtığı sepetteki torbayı geri alır; başkasınınkini ve hazırı alamaz', async () => {
    const camasir = await login('camasir')
    const own = await request(app).post('/api/laundry/items').set(auth(supervisor)).send({ room_id: roomId, item_count: 1, ...OVERRIDE })
    const other = await request(app).post('/api/laundry/items').set(auth(camasir)).send({ room_id: roomId, item_count: 1, ...OVERRIDE })

    const denied = await request(app).post(`/api/laundry/items/${other.body.id}/ledger-cancel`).set(auth(supervisor))
    expect(denied.status).toBe(403)

    const ok = await request(app).post(`/api/laundry/items/${own.body.id}/ledger-cancel`).set(auth(supervisor))
    expect(ok.status).toBe(200)
    expect(getDB().prepare('SELECT id FROM laundry_items WHERE id=?').get(own.body.id)).toBeUndefined()

    const own2 = await request(app).post('/api/laundry/items').set(auth(supervisor)).send({ room_id: roomId, item_count: 1, ...OVERRIDE })
    await request(app).patch(`/api/laundry/items/${own2.body.id}/mark-ready`).set(auth(supervisor)).send({})
    const notDirty = await request(app).post(`/api/laundry/items/${own2.body.id}/ledger-cancel`).set(auth(supervisor))
    expect(notDirty.status).toBe(400)
  })
})
