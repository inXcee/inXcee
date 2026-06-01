import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
let staffId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  let s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  if (!s) {
    db.prepare('INSERT INTO staff(full_name, tc_no, is_active) VALUES(?,?,1)').run('HR Test', '88888888888')
    s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  }
  staffId = s.id
})

describe('HR Onboarding (H3 HR1)', () => {
  it('isE giris checklist baslatir + default 12 adim olusur', async () => {
    const r = await request(app).post('/api/hr/checklists')
      .set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, kind: 'onboarding' })
    expect(r.status).toBe(201)
    const id = r.body.id

    const get = await request(app).get(`/api/hr/checklists/${id}`).set('Authorization', `Bearer ${token}`)
    expect(get.status).toBe(200)
    expect(get.body.kind).toBe('onboarding')
    expect(get.body.items.length).toBeGreaterThanOrEqual(10)
    expect(get.body.status).toBe('open')
  })

  it('adim toggle ve tamamlama', async () => {
    const r = await request(app).post('/api/hr/checklists')
      .set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, kind: 'onboarding' })
    // Onceki test ayni acik checklist'i donmus olabilir
    const cl = (await request(app).get(`/api/hr/checklists/${r.body.id}`).set('Authorization', `Bearer ${token}`)).body
    const firstItem = cl.items[0]

    const t1 = await request(app).patch(`/api/hr/items/${firstItem.id}/toggle`)
      .set('Authorization', `Bearer ${token}`).send({ done: true })
    expect(t1.status).toBe(200)

    const cl2 = (await request(app).get(`/api/hr/checklists/${r.body.id}`).set('Authorization', `Bearer ${token}`)).body
    expect(cl2.completed_count).toBeGreaterThanOrEqual(1)
  })

  it('ozel adim eklenir ve silinir', async () => {
    const cls = (await request(app).get('/api/hr/checklists?kind=onboarding').set('Authorization', `Bearer ${token}`)).body
    if (!cls.length) return
    const id = cls[0].id
    const add = await request(app).post(`/api/hr/checklists/${id}/items`)
      .set('Authorization', `Bearer ${token}`).send({ label: 'Özel test adımı' })
    expect(add.status).toBe(201)

    const del = await request(app).delete(`/api/hr/items/${add.body.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })
})

describe('HR Zod sweep', () => {
  it('cok uzun adim metni 400 doner (sessiz kirpma degil)', async () => {
    const cl = await request(app).post('/api/hr/checklists')
      .set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, kind: 'onboarding' })
    const res = await request(app).post(`/api/hr/checklists/${cl.body.id}/items`)
      .set('Authorization', `Bearer ${token}`).send({ label: 'A'.repeat(201) })
    expect(res.status).toBe(400)
  })
})

describe('HR Offboarding (H3 HR2)', () => {
  it('ayrilma checklist + ibra PDF', async () => {
    const r = await request(app).post('/api/hr/checklists')
      .set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, kind: 'offboarding' })
    expect(r.status).toBe(201)

    const pdf = await request(app).get(`/api/hr/checklists/${r.body.id}/ibra/pdf`)
      .set('Authorization', `Bearer ${token}`)
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toMatch(/pdf/)
    expect(pdf.body.length).toBeGreaterThan(100)
  })

  it('onboarding icin ibra PDF 400 doner', async () => {
    const cls = (await request(app).get('/api/hr/checklists?kind=onboarding').set('Authorization', `Bearer ${token}`)).body
    if (!cls.length) return
    const res = await request(app).get(`/api/hr/checklists/${cls[0].id}/ibra/pdf`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('checklist tamamlama akisi', async () => {
    const r = await request(app).post('/api/hr/checklists')
      .set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, kind: 'offboarding' })
    const comp = await request(app).post(`/api/hr/checklists/${r.body.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
    expect(comp.status).toBe(200)

    const cl = (await request(app).get(`/api/hr/checklists/${r.body.id}`).set('Authorization', `Bearer ${token}`)).body
    expect(cl.status).toBe('completed')
  })
})

describe('HR Sözleşme bitiyor (H3 HR3)', () => {
  it('GET /hr/expiring-contracts liste doner', async () => {
    const db = getDB()
    const future = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
    db.prepare('UPDATE staff SET contract_end = ? WHERE id = ?').run(future, staffId)

    const res = await request(app).get('/api/hr/expiring-contracts?days=30').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.find(r => r.id === staffId)).toBeTruthy()
  })

  it('days parametresi sinir kontrolu (sonsuz tarih yoksa bos liste)', async () => {
    const db = getDB()
    db.prepare('UPDATE staff SET contract_end = NULL').run()
    const res = await request(app).get('/api/hr/expiring-contracts?days=30').set('Authorization', `Bearer ${token}`)
    expect(res.body.length).toBe(0)
  })
})

describe('HR Yetki', () => {
  it('campus_manager olmayan checklist baslatamaz', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app).post('/api/hr/checklists')
      .set('Authorization', `Bearer ${t}`).send({ staff_id: staffId, kind: 'onboarding' })
    expect(res.status).toBe(403)
  })
})
