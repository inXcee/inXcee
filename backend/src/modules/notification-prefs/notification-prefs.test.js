import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
})

describe('Notification preferences', () => {
  it('varsayılan tüm modüller açık döner', async () => {
    const res = await request(app).get('/api/notification-prefs')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(5)
    expect(res.body.every(p => p.enabled === true)).toBe(true)
  })

  it('modül listesi alınabilir', async () => {
    const res = await request(app).get('/api/notification-prefs/modules')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.find(m => m.key === 'maintenance')).toBeTruthy()
  })

  it('tercihler güncellenebilir ve geri alınır', async () => {
    const put = await request(app).put('/api/notification-prefs')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: [
        { module: 'laundry', enabled: false },
        { module: 'maintenance', enabled: true },
      ]})
    expect(put.status).toBe(200)

    const get = await request(app).get('/api/notification-prefs')
      .set('Authorization', `Bearer ${token}`)
    const laundry = get.body.find(p => p.module === 'laundry')
    const maint = get.body.find(p => p.module === 'maintenance')
    expect(laundry.enabled).toBe(false)
    expect(maint.enabled).toBe(true)
  })

  it('geçersiz modül adları sessizce atlanır', async () => {
    const put = await request(app).put('/api/notification-prefs')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: [
        { module: 'invalid_module', enabled: false },
        { module: 'discipline', enabled: false },
      ]})
    expect(put.status).toBe(200)

    const get = await request(app).get('/api/notification-prefs')
      .set('Authorization', `Bearer ${token}`)
    expect(get.body.find(p => p.module === 'discipline').enabled).toBe(false)
    expect(get.body.find(p => p.module === 'invalid_module')).toBeUndefined()
  })

  it('auth olmadan reddedilir', async () => {
    const res = await request(app).get('/api/notification-prefs')
    expect(res.status).toBe(401)
  })

  // A→Z Faz 5
  it('v2 matrix varsayılan tüm kanal/modül açık döner', async () => {
    const res = await request(app).get('/api/notification-prefs/v2')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // modules × channels (4 kanal × modul sayısı)
    expect(res.body.length).toBeGreaterThanOrEqual(40)
    const item = res.body.find(p => p.module === 'maintenance' && p.channel === 'push')
    expect(item).toBeTruthy()
    expect(item.enabled).toBe(true)
    expect(item.min_severity).toBe('info')
  })

  it('v2 set sonrası kanal/severity matrix güncellenir', async () => {
    const put = await request(app).put('/api/notification-prefs/v2')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: [
        { module: 'inventory', channel: 'whatsapp', enabled: true, min_severity: 'warning' },
        { module: 'laundry',   channel: 'push',     enabled: false, min_severity: 'info' },
      ]})
    expect(put.status).toBe(200)

    const get = await request(app).get('/api/notification-prefs/v2')
      .set('Authorization', `Bearer ${token}`)
    const wa = get.body.find(p => p.module === 'inventory' && p.channel === 'whatsapp')
    const ph = get.body.find(p => p.module === 'laundry' && p.channel === 'push')
    expect(wa.enabled).toBe(true)
    expect(wa.min_severity).toBe('warning')
    expect(ph.enabled).toBe(false)
  })

  it('quiet-hours set & get', async () => {
    const put = await request(app).put('/api/notification-prefs/quiet-hours')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_minute: 22*60, end_minute: 8*60, enabled: 1, allow_critical: 1 })
    expect(put.status).toBe(200)
    const get = await request(app).get('/api/notification-prefs/quiet-hours')
      .set('Authorization', `Bearer ${token}`)
    expect(get.body.start_minute).toBe(22*60)
    expect(get.body.enabled).toBe(1)
    expect(get.body.allow_critical).toBe(1)
  })
})
