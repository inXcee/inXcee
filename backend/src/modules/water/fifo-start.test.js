import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// FIFO başlangıç (geçiş) tarihi — Ekim 2026 canlı durumu: Temmuz–Eylül tırları girilmemiş, devir Ekim girişi olarak
// yazılmış; FIFO Ekim girişlerini Eylül açığına bağladığı için Ekim dağıtımları kalıcı "karşılıksız" kalıyordu.
let manager, supervisor
let product, zone
const auth = token => ({ Authorization: `Bearer ${token}` })
const allocated = outId => getDB().prepare(
  'SELECT COALESCE(SUM(qty_base),0) s FROM water_movement_allocations WHERE out_movement_id=?').get(outId).s
const remaining = inId => {
  const row = getDB().prepare(`SELECT mv.qty_base - COALESCE((SELECT SUM(qty_base) FROM water_movement_allocations
    WHERE in_movement_id=mv.id),0) r FROM water_movements mv WHERE id=?`).get(inId)
  return row.r
}
const reviewFlag = id => getDB().prepare('SELECT needs_review FROM water_movements WHERE id=?').get(id).needs_review

async function intake(date, qty) {
  const r = await request(app).post('/api/water/intake').set(auth(manager))
    .send({ product_id: product, input_qty: qty, input_unit: 'adet', move_date: date, waybill_no: `IRS-${date}-${qty}` })
  expect(r.status).toBe(201)
  return r.body.id
}
async function distribute(date, qty) {
  const r = await request(app).post('/api/water/distribute/batch').set(auth(manager))
    .send({ move_date: date, lines: [{ product_id: product, zone_id: zone, input_qty: qty, input_unit: 'adet' }] })
  expect(r.status).toBe(201)
  return r.body.ids[0]
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  manager = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisor = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  product = (await request(app).post('/api/water/products').set(auth(manager))
    .send({ name: 'FIFO Geçiş Test Suyu', unit_label: 'adet', base_unit: 'adet' })).body.id
  zone = (await request(app).post('/api/water/zones').set(auth(manager)).send({ name: 'FIFO Test Bölgesi' })).body.id
})

describe('Su FIFO başlangıç (geçiş) tarihi', () => {
  let sepIn, sepOut, octIn, octOut

  it('ayar yokken eski davranış: Ekim girişi Eylül açığını kapatır, Ekim dağıtımı karşılıksız kalır', async () => {
    const before = await request(app).get('/api/water/pending').set(auth(manager))
    expect(before.body.fifo_start).toBeNull()
    sepIn = await intake('2026-09-01', 100)
    sepOut = await distribute('2026-09-10', 150)          // 50 açık
    octIn = await intake('2026-10-01', 200)                // devir + tır
    octOut = await distribute('2026-10-05', 180)
    expect(allocated(sepOut)).toBe(150)                    // 100 Eylül + 50 Ekim girişinden
    expect(allocated(octOut)).toBe(150)                    // Ekim girişinden kalan 150
    expect(reviewFlag(octOut)).toBe(1)                     // 30 karşılıksız → inceleme
    expect(remaining(sepIn)).toBe(0)
    const r = await request(app).get('/api/water/fifo-start').set(auth(supervisor))
    expect(r.status).toBe(200)
    expect(r.body.date).toBeNull()
  })

  it('yetki ve doğrulama: yalnız müdür yazar; geçersiz/ileri tarih reddedilir', async () => {
    expect((await request(app).put('/api/water/fifo-start').set(auth(supervisor)).send({ date: '2026-10-01' })).status).toBe(403)
    expect((await request(app).put('/api/water/fifo-start').set(auth(manager)).send({ date: '01.10.2026' })).status).toBe(400)
    expect((await request(app).put('/api/water/fifo-start').set(auth(manager)).send({ date: '2999-01-01' })).status).toBe(400)
    expect(getDB().prepare("SELECT 1 FROM system_settings WHERE key='water_fifo_start_date'").get()).toBeUndefined()
  })

  it('tarih ayarlanınca geçişi aşan eşleşme çözülür, Ekim kendi içinde eşleşir, inceleme kapanır', async () => {
    const r = await request(app).put('/api/water/fifo-start').set(auth(manager)).send({ date: '2026-10-01' })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ before: null, date: '2026-10-01', released: 1, cleared_old_reviews: 0 })
    expect(allocated(sepOut)).toBe(100)                    // yalnız Eylül girişi; 50 açık = devirle kapanmış geçmiş
    expect(allocated(octOut)).toBe(180)                    // Ekim girişinden tamamı
    expect(reviewFlag(octOut)).toBe(0)
    expect(remaining(octIn)).toBe(20)
    const audit = getDB().prepare("SELECT detail FROM audit_log WHERE action='water_fifo_start_set' ORDER BY id DESC").get()
    expect(audit?.detail || '').toContain('— → 2026-10-01')
    expect((await request(app).get('/api/water/fifo-start').set(auth(manager))).body.date).toBe('2026-10-01')
  })

  it('tarih sonrası yeni giriş eski açığa gitmez; yeni dağıtım Ekim girişlerinden karşılanır', async () => {
    const newIn = await intake('2026-10-06', 40)
    expect(remaining(newIn)).toBe(40)                      // Eylül'ün 50 açığı yutmadı
    const newOut = await distribute('2026-10-07', 50)
    expect(allocated(newOut)).toBe(50)                     // 20 (1.10) + 30 (6.10)
    expect(reviewFlag(newOut)).toBe(0)
    expect(remaining(newIn)).toBe(10)
    const pending = await request(app).get('/api/water/pending').set(auth(manager))
    expect(pending.status).toBe(200)                       // gecikme/eskalasyon listesi eski açığı göstermez
    expect(pending.body.fifo_start).toBe('2026-10-01')
    expect(pending.body.rows.some(row => row.movement_id === sepOut)).toBe(false)
  })

  it('tarih öncesi dağıtımın inceleme işareti kalkar', async () => {
    const oldOut = await distribute('2026-09-20', 30)     // geçiş öncesine geç giriş: lot yok
    expect(allocated(oldOut)).toBe(0)
    const r = await request(app).put('/api/water/fifo-start').set(auth(manager)).send({ date: '2026-10-01' })
    expect(r.status).toBe(200)
    expect(reviewFlag(oldOut)).toBe(0)
  })

  it('kaldırılınca (null) eski kural döner: boştaki lotlar en eski açığa gider', async () => {
    const r = await request(app).put('/api/water/fifo-start').set(auth(manager)).send({ date: null })
    expect(r.status).toBe(200)
    expect(r.body.date).toBeNull()
    expect(getDB().prepare("SELECT 1 FROM system_settings WHERE key='water_fifo_start_date'").get()).toBeUndefined()
    expect(allocated(sepOut)).toBe(110)                    // 6.10 girişinin kalan 10'u en eski açığa
  })
})
