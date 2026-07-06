import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const db = getDB()
  // Deterministik mutfak verisi: 2 personel — biri diyetli; bugün öğle için
  // 2 beklenen (selection), 1 yemiş (log); yarın 1 beklenen; bugünün menüsü var.
  db.prepare(`INSERT INTO staff(full_name, is_active, diet_flags) VALUES ('Mutfak Test Bir', 1, 'vejetaryen')`).run()
  db.prepare(`INSERT INTO staff(full_name, is_active) VALUES ('Mutfak Test İki', 1)`).run()
  const s1 = db.prepare(`SELECT id FROM staff WHERE full_name='Mutfak Test Bir'`).get().id
  const s2 = db.prepare(`SELECT id FROM staff WHERE full_name='Mutfak Test İki'`).get().id
  const ins = db.prepare(`INSERT INTO meal_selections(staff_id, meal_date, meal_type, attending) VALUES (?, ?, ?, 1)`)
  ins.run(s1, isoToday(), 'lunch'); ins.run(s2, isoToday(), 'lunch')
  ins.run(s1, isoTomorrow(), 'breakfast')
  db.prepare(`INSERT INTO meal_logs(staff_id, meal_type, meal_date) VALUES (?, 'lunch', ?)`).run(s1, isoToday())
  db.prepare(`INSERT INTO meal_menu(meal_date, meal_type, items) VALUES (?, 'lunch', 'Mercimek çorbası, Tavuk sote, Pilav')`).run(isoToday())
})

// YEREL gün — toISOString (UTC) gece 00-03 TR'de dünü verir, endpoint localtime kullanır
function isoToday() { return new Date().toLocaleDateString('sv-SE') }
function isoTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE') }

describe('GET /api/display/kitchen', () => {
  it('auth gerektirmez, öğün bazlı beklenen/servis/menu döndürür', async () => {
    const res = await request(app).get('/api/display/kitchen')
    expect(res.status).toBe(200)
    expect(res.body.date).toBe(isoToday())
    const lunch = res.body.meals.lunch
    expect(lunch.expected).toBeGreaterThanOrEqual(2)
    expect(lunch.served).toBeGreaterThanOrEqual(1)
    expect(lunch.menu).toContain('Mercimek')
    // tüm öğün anahtarları mevcut
    for (const m of ['breakfast', 'lunch', 'dinner']) {
      expect(res.body.meals).toHaveProperty(m)
      expect(typeof res.body.meals[m].expected).toBe('number')
      expect(typeof res.body.meals[m].served).toBe('number')
    }
  })

  it('diyet kırılımını beklenen katılımcılar arasından sayar', async () => {
    const res = await request(app).get('/api/display/kitchen')
    expect(res.status).toBe(200)
    const veg = (res.body.diet || []).find(d => d.flag === 'vejetaryen')
    expect(veg).toBeTruthy()
    expect(veg.count).toBeGreaterThanOrEqual(1)
  })

  it('yarının beklenen sayılarını döndürür', async () => {
    const res = await request(app).get('/api/display/kitchen')
    expect(res.body.tomorrow.breakfast).toBeGreaterThanOrEqual(1)
    expect(typeof res.body.tomorrow.dinner).toBe('number')
  })
})
