import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes, rotateLocationQr } from './service.js'
import { verifyDeployment } from './deployment.js'
import {
  FIELD_SCAN_WINDOW_MINUTES, fieldQrEnforcement, findValidFieldScan, labelState, labelStates,
  parseQrInput, qrRequiredFor, recordFieldScan, resolveScanTarget,
} from './field-scan.js'

// Saha okutması (spec: docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md): temizlikçi kapıdaki QR'ı okutur;
// okutma location_portal_events'e field_scan olarak yazılır ve 60 dk içindeki işareti doğrular.
// QB: deneme bloğu — 101, 102, 103 odaları.
let db, workerA, workerB
const token = key => db.prepare(`
  SELECT q.token FROM location_qr_codes q JOIN service_locations sl ON sl.id=q.location_id
  WHERE sl.qr_location=? AND q.status='active'
`).get(key).token
const locationId = key => db.prepare('SELECT id FROM service_locations WHERE qr_location=?').get(key).id
const setEnforcement = value => db.prepare(`
  INSERT INTO system_settings(key, value) VALUES('saha_qr_enforcement', ?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value
`).run(value)
const thrown = fn => {
  try { fn() } catch (e) { return e }
  return null
}

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds) VALUES('QB', 1, ?, 6, 6)`)
  room.run('101')
  room.run('102')
  room.run('103')
  generateMissingQrCodes({}, null)
  const staff = db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?, 1)')
  workerA = Number(staff.run('Okutma A').lastInsertRowid)
  workerB = Number(staff.run('Okutma B').lastInsertRowid)
})

describe('saha QR okutması', () => {
  it('URL biçimleri: kamera uygulamasının eklediği sondaki / ? # temizlenir', () => {
    const t = token('QB-101')
    const url = `https://avskamp.com/r/${t}`
    for (const value of [url, `${url}/`, `${url}?utm=x`, `${url}#a`, t, `  ${url}  `]) expect(parseQrInput(value)).toBe(t)
    expect(parseQrInput('abc')).toBeNull()
    expect(parseQrInput('')).toBeNull()
    expect(parseQrInput(null)).toBeNull()
  })

  it('okutma kaydı: konum anahtarı saha anahtarıyla aynı, olay field_scan, yanıtta token yok', () => {
    const t = token('QB-101')
    const target = resolveScanTarget(`https://avskamp.com/r/${t}`, db)
    expect(target).toMatchObject({ location: 'QB-101', kind: 'room', block: 'QB', floor: 1, display_name: 'QB Oda 101' })
    const scan = recordFieldScan({ target, workerId: workerA, via: 'camera', ip: '10.0.0.5' }, db)
    expect(scan).toMatchObject({ location: 'QB-101', kind: 'room', label: 'none', room_id: target.room_id })
    expect(scan.scan_id).toBeGreaterThan(0)
    const event = db.prepare('SELECT * FROM location_portal_events WHERE id=?').get(scan.scan_id)
    expect(event).toMatchObject({
      event_type: 'field_scan', actor_mode: 'worker', actor_staff_id: workerA, result: 'opened', location_id: locationId('QB-101'),
    })
    expect(JSON.parse(event.metadata)).toMatchObject({ via: 'camera' })
    expect(JSON.stringify(scan)).not.toContain(t)
  })

  it('iptal edilmiş, bilinmeyen ve pasif konum okutulamaz', () => {
    const old = token('QB-102')
    rotateLocationQr(locationId('QB-102'), null, 'test')
    expect(thrown(() => resolveScanTarget(old, db)))
      .toMatchObject({ statusCode: 410, code: 'qr_revoked', message: 'Bu etiket iptal edilmiş; yenisi basılmalı' })
    expect(thrown(() => resolveScanTarget('x'.repeat(43), db)))
      .toMatchObject({ statusCode: 404, code: 'qr_unknown', message: 'Bu QR sistemde tanımlı değil' })
    expect(thrown(() => resolveScanTarget('abc', db))).toMatchObject({ statusCode: 404, code: 'qr_unknown' })
    const inactive = token('QB-103')
    db.prepare("UPDATE service_locations SET is_active=0 WHERE qr_location='QB-103'").run()
    expect(thrown(() => resolveScanTarget(inactive, db)))
      .toMatchObject({ statusCode: 410, code: 'location_inactive', message: 'Bu konum kullanımda değil' })
  })

  it('pencere: yalnız aynı kişinin aynı yerdeki son 60 dk okutması geçerli', () => {
    const scan = recordFieldScan({ target: resolveScanTarget(token('QB-101'), db), workerId: workerA, ip: '10.0.0.5' }, db)
    expect(FIELD_SCAN_WINDOW_MINUTES).toBe(60)
    expect(findValidFieldScan({ scanId: scan.scan_id, workerId: workerA, location: 'QB-101' }, db)).toMatchObject({ id: scan.scan_id })
    expect(findValidFieldScan({ scanId: scan.scan_id, workerId: workerB, location: 'QB-101' }, db)).toBeNull()
    expect(findValidFieldScan({ scanId: scan.scan_id, workerId: workerA, location: 'QB-102' }, db)).toBeNull()
    expect(findValidFieldScan({ scanId: null, workerId: workerA, location: 'QB-101' }, db)).toBeNull()
    db.prepare("UPDATE location_portal_events SET created_at=datetime('now', '-61 minutes') WHERE id=?").run(scan.scan_id)
    expect(findValidFieldScan({ scanId: scan.scan_id, workerId: workerA, location: 'QB-101' }, db)).toBeNull()
  })

  it('etiket durumu ve zorunluluk: yalnız doğrulanmış ve güncel etiket okutma ister', () => {
    expect(labelState(db, 'QB-101')).toBe('none')
    expect(verifyDeployment({ token: token('QB-101'), expectedLocationId: locationId('QB-101') }, db).ok).toBe(true)
    expect(labelState(db, 'QB-101')).toBe('verified')
    expect(labelStates(db, ['QB-101', 'QB-102']).get('QB-102')).toBe('none')
    expect(fieldQrEnforcement(db)).toBe('off')
    expect(qrRequiredFor(db, 'QB-101')).toBe(false)
    setEnforcement('verified_labels')
    expect(fieldQrEnforcement(db)).toBe('verified_labels')
    expect(qrRequiredFor(db, 'QB-101')).toBe(true)
    expect(qrRequiredFor(db, 'QB-102')).toBe(false)
    rotateLocationQr(locationId('QB-101'), null, 'test')
    expect(labelState(db, 'QB-101')).toBe('stale')
    expect(qrRequiredFor(db, 'QB-101')).toBe(false)
    setEnforcement('bozuk')
    expect(fieldQrEnforcement(db)).toBe('off')
    setEnforcement('off')
  })
})
