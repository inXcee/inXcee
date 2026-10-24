import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { verifyDeployment, markInstalled } from '../location-portal/deployment.js'
import { recordFieldScan, resolveScanTarget } from '../location-portal/field-scan.js'
import { generateMissingQrCodes, rotateLocationQr } from '../location-portal/service.js'
import { markField } from './field.js'
import { fieldReport, setFieldQrEnforcement } from './field-report.js'

// Web "Saha takibi" (spec: docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md §Hedefler 7): kişi başı temizlik ve
// QR oranı, blok başına etiket kapsaması, açık yanlış-kapı kayıtları; QR zorunluluk anahtarı yalnız müdürde.
// FT: deneme bloğu — 101..104.
let db, today, ayse, mehmet, managerToken, supervisorToken
const token = key => db.prepare(`
  SELECT q.token FROM location_qr_codes q JOIN service_locations sl ON sl.id=q.location_id
  WHERE sl.qr_location=? AND q.status='active'
`).get(key).token
const locationId = key => db.prepare('SELECT id FROM service_locations WHERE qr_location=?').get(key).id
const scan = (key, workerId) => recordFieldScan({ target: resolveScanTarget(token(key), db), workerId, ip: '127.0.0.1' }, db)
const login = async username => (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  today = db.prepare("SELECT date('now','localtime') d").get().d
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state) VALUES('FT', 1, ?, 6, 6, 'open')`)
  for (const no of ['101', '102', '103', '104']) room.run(no)
  generateMissingQrCodes({}, null)
  const staff = db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?, 1)')
  ayse = Number(staff.run('Rapor Ayşe').lastInsertRowid)
  mehmet = Number(staff.run('Rapor Mehmet').lastInsertRowid)
  managerToken = await login('mudur')
  supervisorToken = await login('vardiya')
})

describe('saha takibi raporu', () => {
  it('kişi başı sayılar: temizlendi, temizlenemedi, QR ile doğrulanan; ilk ve son temizlik saati', () => {
    markField({ location: 'FT-101', action: 'clean', workerId: ayse, scanId: scan('FT-101', ayse).scan_id })
    markField({ location: 'FT-102', action: 'clean', workerId: ayse })
    markField({ location: 'FT-103', action: 'skip', reason: 'dnd', workerId: mehmet })
    const report = fieldReport({ date: today })
    expect(report.date).toBe(today)
    expect(report.enforcement).toBe('off')
    const row = id => report.workers.find(w => w.worker_id === id)
    expect(row(ayse)).toMatchObject({ full_name: 'Rapor Ayşe', cleaned: 2, skipped: 0, qr_verified: 1 })
    expect(row(ayse).first_at <= row(ayse).last_at).toBe(true)
    expect(row(mehmet)).toMatchObject({ cleaned: 0, skipped: 1, qr_verified: 0 })
  })

  it('blok kapsaması: doğrulandı, asıldı, yok; etiket yenilenince bayat; açık yanlış-kapı sayısı', () => {
    verifyDeployment({ token: token('FT-101'), expectedLocationId: locationId('FT-101') }, db)
    markInstalled([locationId('FT-102')], {}, db)
    verifyDeployment({ token: token('FT-104'), expectedLocationId: locationId('FT-103') }, db)
    let ft = fieldReport({ date: today }).blocks.find(b => b.block === 'FT')
    expect(ft).toMatchObject({ locations: 4, verified: 1, installed: 1, none: 2, stale: 0 })
    rotateLocationQr(locationId('FT-101'), null, 'test')
    ft = fieldReport({ date: today }).blocks.find(b => b.block === 'FT')
    expect(ft).toMatchObject({ verified: 0, stale: 1 })
    expect(fieldReport({ date: today }).mismatches_open).toBeGreaterThanOrEqual(1)
  })

  it('geçersiz tarih 400', () => {
    expect(() => fieldReport({ date: '24.10.2026' })).toThrow('Tarih YYYY-MM-DD olmalı')
  })
})

describe('uçlar ve zorunluluk anahtarı', () => {
  it('amir raporu görür, anahtarı değiştiremez; müdür değiştirir ve denetime düşer; geçersiz mod 400', async () => {
    const report = await request(app).get(`/api/housekeeping/field-report?date=${today}`).set('Authorization', `Bearer ${supervisorToken}`)
    expect(report.status).toBe(200)
    expect(report.body.workers.length).toBeGreaterThan(0)
    const put = (who, mode) => request(app).put('/api/housekeeping/field-qr-enforcement').set('Authorization', `Bearer ${who}`).send({ mode })
    expect((await put(supervisorToken, 'verified_labels')).status).toBe(403)
    const ok = await put(managerToken, 'verified_labels')
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ enforcement: 'verified_labels' })
    expect(db.prepare("SELECT value FROM system_settings WHERE key='saha_qr_enforcement'").get().value).toBe('verified_labels')
    expect(db.prepare(`
      SELECT json_extract(detail, '$.before') AS before, json_extract(detail, '$.after') AS after
      FROM audit_log WHERE action='saha_qr_enforcement_change' ORDER BY id DESC
    `).get()).toEqual({ before: 'off', after: 'verified_labels' })
    expect((await put(managerToken, 'herkes')).status).toBe(400)
    expect(setFieldQrEnforcement('off', null, db)).toEqual({ enforcement: 'off' })
  })
})
