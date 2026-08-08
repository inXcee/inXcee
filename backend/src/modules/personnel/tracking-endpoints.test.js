import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// Personel Takip Merkezi ekranda "Takip verilerinin bir bölümü alınamadı"
// diyordu. O uyarı dört sorgunun HERHANGİ biri hata verince çıkıyor ama
// hangisi olduğunu söylemiyor. Bu dosya dördünü de ekranın gönderdiği
// parametrelerle tek tek çağırır ki hata sessiz kalmasın.

let managerToken
let supervisorToken

const auth = token => ({ Authorization: `Bearer ${token}` })

// Ekrandaki varsayılan: son 30 gün.
function varsayilanAralik() {
  const bugun = new Date()
  const bas = new Date(bugun)
  bas.setDate(bas.getDate() - 29)
  const gun = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: gun(bas), to: gun(bugun) }
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Personel takip uçları — ekranın gönderdiği hâliyle', () => {
  const UCLAR = [
    ['/api/personnel/tracking/overview', () => varsayilanAralik()],
    ['/api/personnel/tracking/people', () => varsayilanAralik()],
    ['/api/personnel/tracking/events', () => ({ ...varsayilanAralik(), limit: 100 })],
    ['/api/personnel/tracking/alerts', () => ({ limit: 100 })],
  ]

  it.each(UCLAR)('%s müdür için 200 döner', async (yol, params) => {
    const res = await request(app).get(yol).set(auth(managerToken)).query(params())
    // Hata gövdesini de göster: 500'de "Sunucu hatasi" yerine sebebi görelim.
    expect(`${yol} → ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('→ 200')
  })

  it.each(UCLAR)('%s vardiya amiri için de 200 döner', async (yol, params) => {
    const res = await request(app).get(yol).set(auth(supervisorToken)).query(params())
    expect(`${yol} → ${res.status}`).toContain('→ 200')
  })

  // Ekran filtre uygulayınca bu parametreler ekleniyor; biri kabul edilmezse
  // kullanıcı filtreyi seçtiği anda "veri alınamadı" görüyor.
  it('proje / departman / durum / arama filtreleri kabul edilir', async () => {
    const db = getDB()
    const proje = db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get()
    const departman = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get()
    const params = {
      ...varsayilanAralik(),
      project_id: String(proje.id),
      department_id: String(departman.id),
      status: 'active',
      q: 'a',
    }
    for (const yol of ['/api/personnel/tracking/overview', '/api/personnel/tracking/people']) {
      const res = await request(app).get(yol).set(auth(managerToken)).query(params)
      expect(`${yol} filtreli → ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('→ 200')
    }
  })

  it('olay türü filtresi kabul edilir', async () => {
    const res = await request(app).get('/api/personnel/tracking/events').set(auth(managerToken))
      .query({ ...varsayilanAralik(), event_type: 'assignment_changed', limit: 100 })
    expect(`→ ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain('→ 200')
  })

  // Yetkisiz rol 403 almalı; 500 alırsa hata gizlenmiş olur.
  it('yetkisiz rol 403 alır (500 değil)', async () => {
    const teknik = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
    const res = await request(app).get('/api/personnel/tracking/overview').set(auth(teknik)).query(varsayilanAralik())
    expect(res.status).toBe(403)
  })
})
