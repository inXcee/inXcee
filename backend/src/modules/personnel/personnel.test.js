import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
let supervisorToken
let staffId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token

  // Seed personel yoksa oluştur
  const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${token}`)).body
  if (!staff || staff.length === 0) {
    const db = getDB()
    db.prepare('INSERT INTO staff(full_name, tc_no, phone, is_active) VALUES(?,?,?,1)')
      .run('Test Personeli', '12345678901', '05551234567')
  }
  const updated = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${token}`)).body
  staffId = updated[0].id
})

describe('Personnel 360° (H1)', () => {
  it('GET /personnel/:id/360 personel verilerini agrege eder', async () => {
    const res = await request(app).get(`/api/personnel/${staffId}/360`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('person')
    expect(res.body).toHaveProperty('emergency_contacts')
    expect(res.body).toHaveProperty('notes')
    expect(res.body).toHaveProperty('shifts')
    expect(res.body).toHaveProperty('shift_summary')
    expect(res.body).toHaveProperty('today_transport')
    expect(res.body).toHaveProperty('transport_summary')
    expect(res.body).toHaveProperty('discipline')
    expect(res.body).toHaveProperty('discipline_total')
    expect(res.body).toHaveProperty('leaves')
    expect(res.body).toHaveProperty('overtime')
    expect(res.body.person.id).toBe(staffId)
  })

  it('var olmayan id icin 404', async () => {
    const res = await request(app).get('/api/personnel/9999999/360').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('GET /personnel/:id/timeline olay listesi doner', async () => {
    const res = await request(app).get(`/api/personnel/${staffId}/timeline`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('Personnel notes (H1 P6)', () => {
  it('not ekler ve listede gozukur', async () => {
    const add = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Test notu — yöneticinin gözlemi', pinned: true })
    expect(add.status).toBe(201)
    const noteId = add.body.id
    expect(noteId).toBeTruthy()

    const r = await request(app).get(`/api/personnel/${staffId}/360`).set('Authorization', `Bearer ${token}`)
    const note = r.body.notes.find(n => n.id === noteId)
    expect(note).toBeTruthy()
    expect(note.note).toContain('Test notu')
    expect(note.pinned).toBe(1)
  })

  it('bos not 400 doner', async () => {
    const res = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${token}`).send({ note: '   ' })
    expect(res.status).toBe(400)
  })

  it('pin toggle calisir', async () => {
    const add = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${token}`).send({ note: 'pin test', pinned: false })
    const noteId = add.body.id

    await request(app).patch(`/api/personnel/notes/${noteId}/pin`).set('Authorization', `Bearer ${token}`)
    const r = await request(app).get(`/api/personnel/${staffId}/360`).set('Authorization', `Bearer ${token}`)
    const n = r.body.notes.find(x => x.id === noteId)
    expect(n.pinned).toBe(1)
  })

  it('not silinir', async () => {
    const add = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${token}`).send({ note: 'silinecek' })
    const noteId = add.body.id

    const del = await request(app).delete(`/api/personnel/notes/${noteId}`).set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })
})

describe('Emergency contacts (H1 P3)', () => {
  it('acil iletisim ekle/sil', async () => {
    const add = await request(app).post(`/api/personnel/${staffId}/emergency-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Anne', relationship: 'Anne', phone: '05551112233' })
    expect(add.status).toBe(201)
    const id = add.body.id

    const r = await request(app).get(`/api/personnel/${staffId}/360`).set('Authorization', `Bearer ${token}`)
    expect(r.body.emergency_contacts.find(c => c.id === id)?.name).toBe('Anne')

    const upd = await request(app).put(`/api/personnel/emergency-contacts/${id}`)
      .set('Authorization', `Bearer ${token}`).send({ phone: '05559998877' })
    expect(upd.status).toBe(200)

    const del = await request(app).delete(`/api/personnel/emergency-contacts/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })

  it('isimsiz acil iletisim 400 doner', async () => {
    const res = await request(app).post(`/api/personnel/${staffId}/emergency-contacts`)
      .set('Authorization', `Bearer ${token}`).send({ phone: '05551112233' })
    expect(res.status).toBe(400)
  })
})

describe('Arşiv (H1 P5)', () => {
  it('arsivler ve geri alir', async () => {
    const db = getDB()
    db.prepare('INSERT INTO staff(full_name, tc_no, is_active) VALUES(?,?,1)').run('Arşiv Test', '99999999999')
    const targetId = db.prepare('SELECT id FROM staff WHERE tc_no=?').get('99999999999').id

    const arch = await request(app).post(`/api/personnel/${targetId}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'İşten ayrıldı' })
    expect(arch.status).toBe(200)

    const arc = await request(app).get('/api/personnel/archived').set('Authorization', `Bearer ${token}`)
    expect(arc.body.find(p => p.id === targetId)).toBeTruthy()
    expect(arc.body.find(p => p.id === targetId).archive_reason).toBe('İşten ayrıldı')

    const restore = await request(app).post(`/api/personnel/${targetId}/restore`)
      .set('Authorization', `Bearer ${token}`)
    expect(restore.status).toBe(200)

    const arc2 = await request(app).get('/api/personnel/archived').set('Authorization', `Bearer ${token}`)
    expect(arc2.body.find(p => p.id === targetId)).toBeFalsy()
  })
})

describe('Risk listesi (H1 R5)', () => {
  it('GET /personnel/risk skor verir', async () => {
    const res = await request(app).get('/api/personnel/risk?limit=20').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    res.body.forEach(r => {
      expect(r).toHaveProperty('risk_score')
      expect(r).toHaveProperty('shift_absent')
      expect(r).toHaveProperty('transport_no_show')
      expect(r).toHaveProperty('discipline_score')
      expect(r).toHaveProperty('contract_expiring')
    })
  })
})

describe('Zod validation (cross-cutting sweep)', () => {
  it('4000 karakterden uzun not 400 doner (sessiz kirpma degil)', async () => {
    const res = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'x'.repeat(4001) })
    expect(res.status).toBe(400)
  })

  it('cok uzun acil iletisim ismi 400 doner', async () => {
    const res = await request(app).post(`/api/personnel/${staffId}/emergency-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A'.repeat(201) })
    expect(res.status).toBe(400)
  })

  it('cok uzun telefon 400 doner', async () => {
    const res = await request(app).post(`/api/personnel/${staffId}/emergency-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Anne', phone: '0'.repeat(41) })
    expect(res.status).toBe(400)
  })

  it('cok uzun arsiv gerekcesi 400 doner', async () => {
    const db = getDB()
    db.prepare('INSERT INTO staff(full_name, tc_no, is_active) VALUES(?,?,1)').run('Uzun Arşiv', '88888888888')
    const targetId = db.prepare('SELECT id FROM staff WHERE tc_no=?').get('88888888888').id
    const res = await request(app).post(`/api/personnel/${targetId}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'r'.repeat(501) })
    expect(res.status).toBe(400)
  })
})

describe('Yetki kontrolü', () => {
  it('campus_manager olmayan not ekleyemez', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app).post(`/api/personnel/${staffId}/notes`)
      .set('Authorization', `Bearer ${t}`).send({ note: 'x' })
    expect(res.status).toBe(403)
  })

  it('dusuk yetkili rol birlesik personel dosyasini goruntuleyemez', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const r1 = await request(app).get(`/api/personnel/${staffId}/360`).set('Authorization', `Bearer ${t}`)
    expect(r1.status).toBe(403)
    const r2 = await request(app).get('/api/personnel/risk').set('Authorization', `Bearer ${t}`)
    expect(r2.status).toBe(403)
  })

  it('vardiya sorumlusu operasyonel dosyayi maskeli gorur', async () => {
    const db = getDB()
    db.prepare('UPDATE staff SET tc_no=?, salary=?, iban=? WHERE id=?')
      .run('79999999991', 42000, 'TR330006100519786457841326', staffId)
    const res = await request(app).get(`/api/personnel/${staffId}/360`)
      .set('Authorization', `Bearer ${supervisorToken}`)
    expect(res.status).toBe(200)
    expect(res.body.person.tc_no).toBe('799******91')
    expect(res.body.person).not.toHaveProperty('salary')
    expect(res.body.person).not.toHaveProperty('iban')
    expect(res.body.access.can_view_sensitive_fields).toBe(false)
  })

  it('kampus muduru hassas personel alanlarini gorur', async () => {
    const res = await request(app).get(`/api/personnel/${staffId}/360`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.person.tc_no).toBe('79999999991')
    expect(res.body.person.salary).toBe(42000)
    expect(res.body.person.iban).toBe('TR330006100519786457841326')
    expect(res.body.access.can_view_sensitive_fields).toBe(true)
  })
})
