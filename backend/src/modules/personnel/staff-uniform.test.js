import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let lowToken
let staffId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login')
    .send({ username: 'vardiya', password: 'admin123' })).body.token
  lowToken = (await request(app).post('/api/auth/login')
    .send({ username: 'teknik', password: 'admin123' })).body.token
  const db = getDB()
  staffId = db.prepare("INSERT INTO staff(tc_no, full_name, is_active) VALUES('76666666666','Kıyafet Test',1)").run().lastInsertRowid
})

describe('staff uniform sizes + issuance', () => {
  it('migration seeds standard uniform items', () => {
    const count = getDB().prepare('SELECT COUNT(*) AS c FROM uniform_items WHERE is_active=1').get().c
    expect(count).toBeGreaterThanOrEqual(10)
  })

  it('lists uniform catalog and empty sizes for a staff', async () => {
    const res = await request(app).get(`/api/personnel/${staffId}/uniform`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.items.some(i => i.item_key === 'work_pants')).toBe(true)
    expect(res.body.items.find(i => i.item_key === 'safety_shoes').size_kind).toBe('numeric')
    expect(res.body.items.every(i => i.size === null)).toBe(true)
    expect(res.body.summary.active_issues).toBe(0)
  })

  it('saves sizes (bulk upsert) and reflects them', async () => {
    const save = await request(app).put(`/api/personnel/${staffId}/uniform/sizes`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ sizes: [
        { item_key: 'work_pants', size: '52' },
        { item_key: 'work_tshirt', size: 'XL', note: 'geniş' },
        { item_key: 'safety_shoes', size: '43' },
        { item_key: 'not_a_type', size: 'X' }, // yok sayılır
      ] })
    expect(save.status).toBe(200)
    expect(save.body.saved).toBe(3)

    const res = await request(app).get(`/api/personnel/${staffId}/uniform`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.body.items.find(i => i.item_key === 'work_pants').size).toBe('52')
    expect(res.body.items.find(i => i.item_key === 'work_tshirt').note).toBe('geniş')
    expect(res.body.summary.sized).toBe(3)
  })

  it('clears a size when submitted empty', async () => {
    await request(app).put(`/api/personnel/${staffId}/uniform/sizes`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ sizes: [{ item_key: 'work_tshirt', size: '' }] })
    const res = await request(app).get(`/api/personnel/${staffId}/uniform`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.body.items.find(i => i.item_key === 'work_tshirt').size).toBeNull()
  })

  it('issues an item and returns it, tracking active quantity', async () => {
    const issue = await request(app).post(`/api/personnel/${staffId}/uniform/issue`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ item_key: 'work_pants', size: '52', quantity: 2, note: 'yazlık' })
    expect(issue.status).toBe(201)
    const issueId = issue.body.id

    let res = await request(app).get(`/api/personnel/${staffId}/uniform`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.body.items.find(i => i.item_key === 'work_pants').active_quantity).toBe(2)
    expect(res.body.summary.active_issues).toBe(1)

    const ret = await request(app).post(`/api/personnel/uniform/issues/${issueId}/return`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(ret.status).toBe(200)
    // İkinci iade reddedilir
    const retAgain = await request(app).post(`/api/personnel/uniform/issues/${issueId}/return`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(retAgain.status).toBe(400)

    res = await request(app).get(`/api/personnel/${staffId}/uniform`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.body.items.find(i => i.item_key === 'work_pants').active_quantity).toBe(0)
  })

  it('rejects invalid item on issue and unknown staff / low role', async () => {
    const bad = await request(app).post(`/api/personnel/${staffId}/uniform/issue`)
      .set('Authorization', `Bearer ${managerToken}`).send({ item_key: 'nope' })
    expect(bad.status).toBe(400)
    const missing = await request(app).get('/api/personnel/99999/uniform')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(missing.status).toBe(404)
    const forbidden = await request(app).get(`/api/personnel/${staffId}/uniform`)
      .set('Authorization', `Bearer ${lowToken}`)
    expect(forbidden.status).toBe(403)
  })
})

describe('uniform item catalog management', () => {
  it('lets the manager create and toggle a type, blocks supervisor', async () => {
    const create = await request(app).post('/api/personnel/uniform/items')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ label: 'Kışlık Mont', category: 'clothing', size_kind: 'text' })
    expect(create.status).toBe(201)
    expect(create.body.item_key).toBeTruthy()

    const patch = await request(app).patch(`/api/personnel/uniform/items/${create.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`).send({ is_active: false })
    expect(patch.status).toBe(200)

    const blocked = await request(app).post('/api/personnel/uniform/items')
      .set('Authorization', `Bearer ${supervisorToken}`).send({ label: 'X' })
    expect(blocked.status).toBe(403)
  })

  it('deactivates instead of deleting a type that has data', async () => {
    const db = getDB()
    const item = db.prepare("SELECT id FROM uniform_items WHERE item_key='work_pants'").get()
    const del = await request(app).delete(`/api/personnel/uniform/items/${item.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
    expect(del.body.deactivated).toBe(true)
  })
})
