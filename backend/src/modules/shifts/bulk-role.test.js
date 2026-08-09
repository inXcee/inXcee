import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Canlıda 196 aktif personelin 195'inde rol atanmamış. Toplu atama ekranı
// proje, departman ve çalışma noktasını değiştirebiliyordu ama ROLÜ
// değiştiremiyordu — yani en büyük boşluk tek tek düzeltilmek zorundaydı.
// Hazırlık ekranı sorunu gösteriyor; düzeltme yolu da olmalı.

let managerToken, roleA, roleB, staffIds

const auth = () => ({ Authorization: `Bearer ${managerToken}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  const roller = db.prepare('SELECT id FROM staff_roles ORDER BY id LIMIT 2').all()
  roleA = roller[0].id
  roleB = roller[1]?.id ?? roller[0].id
  // Rolü boşaltılmış üç personel — canlıdaki duruma benzet
  staffIds = db.prepare('SELECT id FROM staff WHERE is_active=1 ORDER BY id LIMIT 3').all().map(r => r.id)
  db.prepare(`UPDATE staff SET role_id = NULL WHERE id IN (${staffIds.map(() => '?').join(',')})`).run(...staffIds)
})

describe('toplu rol ataması', () => {
  it('seçilen herkesin rolünü günceller', async () => {
    const res = await request(app).post('/api/shifts/staff/bulk/assignment').set(auth())
      .send({ staff_ids: staffIds, role_id: roleA })
    expect(`${res.status} ${JSON.stringify(res.body).slice(0, 150)}`).toContain('200')

    const db = getDB()
    const roller = db.prepare(`SELECT role_id FROM staff WHERE id IN (${staffIds.map(() => '?').join(',')})`).all(...staffIds)
    expect(roller.every(r => r.role_id === roleA)).toBe(true)
  })

  // "Değiştirme" seçilirse rol bozulmamalı: departman güncellerken rolü
  // sıfırlamak, düzelttiğini bozmak olur.
  it('rol gönderilmezse mevcut rol korunur', async () => {
    const db = getDB()
    const departman = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get().id
    await request(app).post('/api/shifts/staff/bulk/assignment').set(auth())
      .send({ staff_ids: staffIds, department_id: departman })

    const roller = db.prepare(`SELECT role_id FROM staff WHERE id IN (${staffIds.map(() => '?').join(',')})`).all(...staffIds)
    expect(roller.every(r => r.role_id === roleA)).toBe(true)
  })

  it('rol açıkça null gönderilirse kaldırılır', async () => {
    const res = await request(app).post('/api/shifts/staff/bulk/assignment').set(auth())
      .send({ staff_ids: [staffIds[0]], role_id: null })
    expect(res.status).toBe(200)
    expect(getDB().prepare('SELECT role_id FROM staff WHERE id=?').get(staffIds[0]).role_id).toBeNull()
  })

  it('yalnız rol göndermek yeterli — başka alan şart değil', async () => {
    const res = await request(app).post('/api/shifts/staff/bulk/assignment').set(auth())
      .send({ staff_ids: [staffIds[1]], role_id: roleB })
    expect(res.status).toBe(200)
    expect(getDB().prepare('SELECT role_id FROM staff WHERE id=?').get(staffIds[1]).role_id).toBe(roleB)
  })

  // Hazırlık ekranındaki rol sayacı bu işlemden sonra düşmeli; yoksa kullanıcı
  // düzelttiği hâlde uyarıyı görmeye devam eder.
  it('hazırlık ekranındaki rolsüz sayısı düşer', async () => {
    const once = (await request(app).get('/api/shifts/readiness').set(auth())).body
      .items.find(i => i.key === 'staff_role').count
    const db = getDB()
    const rolsuzler = db.prepare('SELECT id FROM staff WHERE is_active=1 AND role_id IS NULL LIMIT 2').all().map(r => r.id)
    if (rolsuzler.length === 0) return
    await request(app).post('/api/shifts/staff/bulk/assignment').set(auth())
      .send({ staff_ids: rolsuzler, role_id: roleA })
    const sonra = (await request(app).get('/api/shifts/readiness').set(auth())).body
      .items.find(i => i.key === 'staff_role').count
    expect(sonra).toBe(once - rolsuzler.length)
  })
})
