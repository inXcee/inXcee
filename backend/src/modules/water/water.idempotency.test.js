import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, productId, zoneId
const auth = () => ({ Authorization: `Bearer ${token}` })
const count = (type) => getDB().prepare('SELECT COUNT(*) c FROM water_movements WHERE type=?').get(type).c

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  const mgr = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const p = await request(app).post('/api/water/products').set('Authorization', `Bearer ${mgr}`)
    .send({ name: 'İdem Su 0.5', unit_label: 'şişe', base_unit: 'adet' })
  productId = p.body.id
  zoneId = (await request(app).post('/api/water/zones').set('Authorization', `Bearer ${mgr}`)
    .send({ name: 'İdem Bölge', code: 'ID-01' })).body.id
})

describe('Su — sunucu tarafı tekil işlem anahtarı', () => {
  it('aynı anahtarla tekrar gelen giriş ikinci hareket açmaz, ilk yanıtı döndürür', async () => {
    const body = { product_id: productId, input_qty: 10, input_unit: 'adet', move_date: '2026-10-01', waybill_no: 'IRS-ID1' }
    const before = count('in')
    const a = await request(app).post('/api/water/intake').set(auth()).set('X-Idempotency-Key', 'tg:111:1').send(body)
    const b = await request(app).post('/api/water/intake').set(auth()).set('X-Idempotency-Key', 'tg:111:1').send(body)
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    expect(b.body.id).toBe(a.body.id)
    expect(b.headers['x-idempotent-replay']).toBe('1')
    expect(count('in')).toBe(before + 1)
  })

  it('aynı anahtar farklı içerikle 422 döner ve yazmaz', async () => {
    const before = count('in')
    const r = await request(app).post('/api/water/intake').set(auth()).set('X-Idempotency-Key', 'tg:111:1')
      .send({ product_id: productId, input_qty: 99, input_unit: 'adet', move_date: '2026-10-01', waybill_no: 'IRS-ID1' })
    expect(r.status).toBe(422)
    expect(count('in')).toBe(before)
  })

  it('çok satırlı dağıtım tek batch: tekrar denemede satırlar çoğalmaz', async () => {
    const body = { move_date: '2026-10-02', lines: [
      { product_id: productId, zone_id: zoneId, input_qty: 2, input_unit: 'adet' },
      { product_id: productId, zone_id: zoneId, input_qty: 3, input_unit: 'adet' },
    ] }
    const before = count('out')
    const a = await request(app).post('/api/water/distribute/batch').set(auth()).set('X-Idempotency-Key', 'tg:222:7').send(body)
    const b = await request(app).post('/api/water/distribute/batch').set(auth()).set('X-Idempotency-Key', 'tg:222:7').send(body)
    expect(a.status).toBe(201)
    expect(b.body.ids).toEqual(a.body.ids)
    expect(count('out')).toBe(before + 2)
  })

  it('hatalı batch hiçbir satırı yazmaz ve anahtarı tüketmez', async () => {
    const before = count('out')
    const bad = { move_date: '2026-10-02', lines: [
      { product_id: productId, zone_id: zoneId, input_qty: 2, input_unit: 'adet' },
      { product_id: 999999, zone_id: zoneId, input_qty: 1, input_unit: 'adet' },
    ] }
    const r = await request(app).post('/api/water/distribute/batch').set(auth()).set('X-Idempotency-Key', 'tg:333:1').send(bad)
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(count('out')).toBe(before)
    const good = { ...bad, lines: [bad.lines[0]] }
    const ok = await request(app).post('/api/water/distribute/batch').set(auth()).set('X-Idempotency-Key', 'tg:333:1').send(good)
    expect(ok.status).toBe(201)
    expect(count('out')).toBe(before + 1)
  })

  it('anahtarsız istek eski davranışla her seferinde yazar', async () => {
    const body = { product_id: productId, input_qty: 1, input_unit: 'adet', move_date: '2026-10-03' }
    const before = count('in')
    await request(app).post('/api/water/intake').set(auth()).send(body)
    await request(app).post('/api/water/intake').set(auth()).send(body)
    expect(count('in')).toBe(before + 2)
  })

  it('kısa anahtar reddedilir', async () => {
    const r = await request(app).post('/api/water/intake').set(auth()).set('X-Idempotency-Key', 'x')
      .send({ product_id: productId, input_qty: 1, input_unit: 'adet', move_date: '2026-10-03' })
    expect(r.status).toBe(400)
  })
})
