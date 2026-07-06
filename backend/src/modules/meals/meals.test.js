import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { mealTypeForNow, mealDayFor, localDay } from './service.js'

let token, staffId, qrToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  let s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  if (!s) {
    db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?, 1)').run('Meal Test')
    s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('Meal Test')
  }
  staffId = s.id
  const g = await request(app).post(`/api/qr/staff/${staffId}/generate`).set('Authorization', `Bearer ${token}`).send({})
  qrToken = g.body.qr_token
})

describe('Meals — Zod sweep', () => {
  it('gecersiz meal_type 400 doner', async () => {
    const res = await request(app).post('/api/meals/log')
      .set('Authorization', `Bearer ${token}`).send({ staff_id: staffId, meal_type: 'brunch' })
    expect(res.status).toBe(400)
  })

  it('cok uzun menu 400 doner', async () => {
    const res = await request(app).put('/api/meals/menu')
      .set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-06-02', meal_type: 'lunch', items: 'm'.repeat(2001) })
    expect(res.status).toBe(400)
  })
})

describe('H7 YM1 — Öğün okutma', () => {
  it('staff_id ile öğün kaydedilir', async () => {
    const r = await request(app).post('/api/meals/log').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, meal_type: 'lunch', meal_date: '2026-09-01' })
    expect(r.status).toBe(201)
    expect(r.body.staff_id).toBe(staffId)
  })

  it('aynı öğün ikinci kez 409', async () => {
    const r = await request(app).post('/api/meals/log').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, meal_type: 'lunch', meal_date: '2026-09-01' })
    expect(r.status).toBe(409)
  })

  it('QR token ile öğün kaydedilir', async () => {
    const r = await request(app).post('/api/meals/log').set('Authorization', `Bearer ${token}`)
      .send({ qr_token: qrToken, meal_type: 'dinner', meal_date: '2026-09-01' })
    expect(r.status).toBe(201)
    expect(r.body.staff_id).toBe(staffId)
  })

  it('geçersiz QR 404', async () => {
    const r = await request(app).post('/api/meals/log').set('Authorization', `Bearer ${token}`)
      .send({ qr_token: 'invalid', meal_type: 'breakfast' })
    expect(r.status).toBe(404)
  })

  it('geçersiz meal_type 400', async () => {
    const r = await request(app).post('/api/meals/log').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, meal_type: 'midnight' })
    expect(r.status).toBe(400)
  })

  it('staff_id ve qr_token yoksa 400', async () => {
    const r = await request(app).post('/api/meals/log').set('Authorization', `Bearer ${token}`)
      .send({ meal_type: 'lunch' })
    expect(r.status).toBe(400)
  })
})

describe('H7 daily + forecast + cost', () => {
  it('GET /daily counts ve logs döner', async () => {
    const r = await request(app).get('/api/meals/daily?date=2026-09-01').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('counts')
    expect(r.body).toHaveProperty('logs')
    expect(r.body.counts.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /forecast tahmin döner', async () => {
    const r = await request(app).get('/api/meals/forecast').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('scheduled')
    expect(r.body).toHaveProperty('averages')
    expect(r.body).toHaveProperty('diet_summary')
  })

  it('GET /cost-summary aylık maliyet özeti', async () => {
    const r = await request(app).get('/api/meals/cost-summary?month=2026-09').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body.month).toBe('2026-09')
    expect(Array.isArray(r.body.by_meal)).toBe(true)
    expect(Array.isArray(r.body.by_staff)).toBe(true)
  })
})

describe('H7 YM2 — Diyet flag', () => {
  it('PUT /staff/:id/diet set/unset', async () => {
    const r = await request(app).put(`/api/meals/staff/${staffId}/diet`).set('Authorization', `Bearer ${token}`)
      .send({ diet_flags: 'vegetarian,gluten-free' })
    expect(r.status).toBe(200)
    const db = getDB()
    const s = db.prepare('SELECT diet_flags FROM staff WHERE id = ?').get(staffId)
    expect(s.diet_flags).toBe('vegetarian,gluten-free')
  })
})

describe('H7 Yetki + silme', () => {
  it('campus_manager olmayan log atamaz', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const r = await request(app).post('/api/meals/log').set('Authorization', `Bearer ${t}`)
      .send({ staff_id: staffId, meal_type: 'lunch' })
    expect(r.status).toBe(403)
  })

  it('log silinir', async () => {
    const c = await request(app).post('/api/meals/log').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, meal_type: 'snack', meal_date: '2026-09-02' })
    const r = await request(app).delete(`/api/meals/log/${c.body.id}`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
  })
})

describe('Meals — devam/katılım raporu (Faz 4)', () => {
  it('GET /attendance vardiyalı vs yiyen + no-show listesi döner', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const db = getDB()
    // İki vardiyalı personel: biri yedi, biri yemedi (no-show)
    db.prepare('INSERT INTO staff(full_name,is_active) VALUES(?,1)').run('Att Yiyen')
    db.prepare('INSERT INTO staff(full_name,is_active) VALUES(?,1)').run('Att NoShow')
    const ate = db.prepare("SELECT id FROM staff WHERE full_name='Att Yiyen'").get().id
    const noshow = db.prepare("SELECT id FROM staff WHERE full_name='Att NoShow'").get().id
    const sched = db.prepare(`INSERT OR REPLACE INTO shift_schedule(staff_id,work_date,status) VALUES(?,?, 'scheduled')`)
    sched.run(ate, today); sched.run(noshow, today)
    db.prepare(`INSERT OR IGNORE INTO meal_logs(staff_id,meal_type,meal_date,method) VALUES(?, 'lunch', ?, 'manual')`).run(ate, today)

    const r = await request(app).get(`/api/meals/attendance?date=${today}&meal_type=lunch`).set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body.scheduled).toBeGreaterThanOrEqual(2)
    expect(r.body.ate).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(r.body.no_show)).toBe(true)
    expect(r.body.no_show.some(x => x.staff_id === noshow)).toBe(true)
    expect(r.body.no_show.some(x => x.staff_id === ate)).toBe(false)
  })

  it('geçersiz meal_type 400', async () => {
    const r = await request(app).get('/api/meals/attendance?meal_type=brunch').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(400)
  })
})

describe('Meals — ertesi-gün öğün seçimi (Faz 8)', () => {
  it('PUT /selection kaydeder, GET /selection-counts yansıtır', async () => {
    const r = await request(app).put('/api/meals/selection').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, meal_date: '2026-12-01', meal_type: 'lunch', attending: true })
    expect(r.status).toBe(200)
    const g = await request(app).get('/api/meals/selection-counts?date=2026-12-01').set('Authorization', `Bearer ${token}`)
    expect(g.status).toBe(200)
    const lunch = g.body.counts.find(c => c.meal_type === 'lunch')
    expect(lunch.count).toBeGreaterThanOrEqual(1)
  })

  it('attending=false sayıma girmez (upsert)', async () => {
    await request(app).put('/api/meals/selection').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, meal_date: '2026-12-02', meal_type: 'dinner', attending: true })
    await request(app).put('/api/meals/selection').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, meal_date: '2026-12-02', meal_type: 'dinner', attending: false })
    const g = await request(app).get('/api/meals/selection-counts?date=2026-12-02').set('Authorization', `Bearer ${token}`)
    const dinner = g.body.counts.find(c => c.meal_type === 'dinner')
    expect(dinner).toBeUndefined()
  })

  it('geçersiz meal_type 400', async () => {
    const r = await request(app).put('/api/meals/selection').set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffId, meal_date: '2026-12-01', meal_type: 'brunch' })
    expect(r.status).toBe(400)
  })
})

describe('Meals — gün sınırı LOCALTIME (TZ paritesi)', () => {
  // Varsayılan tarihler SQLite date('now','localtime') ile aynı olmalı —
  // toISOString (UTC) kullanılsaydı 00:00-03:00 TR arası dün/yanlış gün dönerdi.
  it('GET /daily varsayılan tarih = yerel bugün', async () => {
    const r = await request(app).get('/api/meals/daily').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body.date).toBe(getDB().prepare("SELECT date('now','localtime') d").get().d)
  })

  it('GET /selection-counts varsayılan tarih = yerel yarın', async () => {
    const r = await request(app).get('/api/meals/selection-counts').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body.date).toBe(getDB().prepare("SELECT date('now','localtime','+1 days') d").get().d)
  })

  it('mealDayFor utcTs verilince o anın yerel gününü döner', () => {
    const db = getDB()
    expect(mealDayFor(db, '2026-06-11 22:30:00')).toBe(
      db.prepare("SELECT date('2026-06-11 22:30:00','localtime') d").get().d)
    expect(mealDayFor(db)).toBe(localDay(db, 0))
  })

  it('mealTypeForNow verilen anın YEREL saatine göre öğün türetir', () => {
    // Yerel saat kurucusu — TZ ne olursa olsun deterministik
    expect(mealTypeForNow(new Date(2026, 5, 11, 8, 0))).toBe('breakfast')
    expect(mealTypeForNow(new Date(2026, 5, 11, 12, 0))).toBe('lunch')
    expect(mealTypeForNow(new Date(2026, 5, 11, 18, 0))).toBe('dinner')
    expect(mealTypeForNow(new Date(2026, 5, 11, 23, 0))).toBe('snack')
  })
})

describe('Meals — menu', () => {
  it('PUT menu upsert + GET menu döner', async () => {
    const put = await request(app).put('/api/meals/menu')
      .set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-07-10', meal_type: 'lunch', items: 'Mercimek\nTavuk\nPilav' })
    expect(put.status).toBe(200)
    const get = await request(app).get('/api/meals/menu?date=2026-07-10')
      .set('Authorization', `Bearer ${token}`)
    expect(get.status).toBe(200)
    const lunch = get.body.find(m => m.meal_type === 'lunch')
    expect(lunch.items).toContain('Tavuk')
  })
  it('PUT aynı date+type günceller (upsert)', async () => {
    await request(app).put('/api/meals/menu').set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-07-11', meal_type: 'dinner', items: 'eski' })
    await request(app).put('/api/meals/menu').set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-07-11', meal_type: 'dinner', items: 'yeni' })
    const get = await request(app).get('/api/meals/menu?date=2026-07-11').set('Authorization', `Bearer ${token}`)
    expect(get.body.find(m => m.meal_type === 'dinner').items).toBe('yeni')
  })
  it('geçersiz meal_type 400', async () => {
    const res = await request(app).put('/api/meals/menu').set('Authorization', `Bearer ${token}`)
      .send({ meal_date: '2026-07-10', meal_type: 'brunch', items: 'x' })
    expect(res.status).toBe(400)
  })
})
