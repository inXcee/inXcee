// Saha okutması (docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md): temizlikçi kapıdaki QR'ı okutur.
// Okutma location_portal_events'e field_scan olarak düşer (sakin analitiği 'scan' türünü sayar, karışmaz) ve
// 60 dk içindeki işareti QR ile doğrulanmış yapar. Konum anahtarı saha anahtarıyla aynıdır (M1-101, M1-1-corridor).
// Token hiçbir yanıtta dönmez.
import { getDB } from '../../shared/db/index.js'
import { effectiveDeploymentState, verifyDeployment } from './deployment.js'
import { recordPortalEvent } from './public-service.js'
import { resolveLocationToken } from './service.js'

export const FIELD_SCAN_WINDOW_MINUTES = 60
const ENFORCEMENT = new Set(['off', 'verified_labels'])
const fail = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code })

// Kamera uygulaması adresin sonuna / ? # ekleyebilir; token son yol parçasıdır.
export function parseQrInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const token = text.split(/[?#]/)[0].split('/').filter(Boolean).pop() || ''
  return token.length >= 43 && token.length <= 64 ? token : null
}

export function resolveScanTarget(qr, db = getDB()) {
  const token = parseQrInput(qr)
  const row = token ? resolveLocationToken(token) : null
  if (!row) throw fail('Bu QR sistemde tanımlı değil', 404, 'qr_unknown')
  if (row.qr_status !== 'active') throw fail('Bu etiket iptal edilmiş; yenisi basılmalı', 410, 'qr_revoked')
  if (!row.is_active) throw fail('Bu konum kullanımda değil', 410, 'location_inactive')
  return {
    qr_id: row.qr_id,
    location_id: row.location_id,
    location: row.qr_location,
    kind: row.location_type === 'room' ? 'room' : 'common',
    block: row.block,
    floor: row.floor,
    room_id: row.room_id ?? null,
    display_name: row.display_name,
  }
}

export function recordFieldScan({ target, workerId, via = 'in_app', ip }, db = getDB()) {
  const scanId = Number(recordPortalEvent({
    locationId: target.location_id,
    qrCodeId: target.qr_id,
    eventType: 'field_scan',
    actorMode: 'worker',
    actorStaffId: workerId,
    result: 'opened',
    ip,
    metadata: { via: via === 'camera' ? 'camera' : 'in_app' },
  }))
  const { created_at: at } = db.prepare('SELECT created_at FROM location_portal_events WHERE id=?').get(scanId)
  return {
    scan_id: scanId,
    location: target.location,
    kind: target.kind,
    block: target.block,
    floor: target.floor,
    room_id: target.room_id,
    display_name: target.display_name,
    qr_label: labelState(db, target.location),
    at,
  }
}

// İşareti doğrulayan okutma: aynı kişi, aynı yer, son 60 dk. Başkasının ya da eski okutma doğrulamaz.
export function findValidFieldScan({ scanId, workerId, location }, db = getDB()) {
  if (!scanId || workerId == null) return null
  return db.prepare(`
    SELECT e.id, e.created_at FROM location_portal_events e
    JOIN service_locations sl ON sl.id=e.location_id
    WHERE e.id=? AND e.event_type='field_scan' AND e.actor_staff_id=? AND sl.qr_location=?
      AND e.created_at >= datetime('now', ?)
  `).get(Number(scanId), Number(workerId), String(location), `-${FIELD_SCAN_WINDOW_MINUTES} minutes`) || null
}

// Etiketin fiziksel durumu, yönetim raporuyla aynı türetme. Kayıt yoksa 'none': "kurulmadı" değil, bilinmiyor.
export function labelStates(db = getDB(), keys = []) {
  const unique = [...new Set(keys.map(String))]
  const states = new Map(unique.map(key => [key, 'none']))
  if (!unique.length) return states
  const rows = db.prepare(`
    SELECT sl.qr_location, q.id AS active_qr_id, d.status AS raw_status, d.qr_code_id AS deployed_qr_id
    FROM service_locations sl
    LEFT JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    LEFT JOIN location_qr_deployments d ON d.location_id=sl.id
    WHERE sl.qr_location IN (${unique.map(() => '?').join(',')})
  `).all(...unique)
  for (const row of rows) {
    const { state } = effectiveDeploymentState(row)
    states.set(row.qr_location, state === 'unknown' || state === 'qr_missing' ? 'none' : state)
  }
  return states
}

export const labelState = (db, key) => labelStates(db, [key]).get(String(key))

// Sahadan etiket doğrulama: beklenen yer = görevlinin panoda açtığı yer. Yanlış kapı ve iptal etiket
// verifyDeployment kuralıyla kaydedilir; doğrulayan saha personeli ayrı sütuna yazılır.
export function verifyFieldLabel({ location, qr, workerId }, db = getDB()) {
  const expected = db.prepare('SELECT id FROM service_locations WHERE qr_location=? AND is_active=1').get(String(location))
  if (!expected) throw fail('Yer bulunamadı', 404, 'location_not_found')
  const { ok, code, message } = verifyDeployment({
    token: parseQrInput(qr) ?? String(qr), expectedLocationId: expected.id, staffId: workerId,
  }, db)
  return { ok, code, message }
}

export function fieldQrEnforcement(db = getDB()) {
  const value = db.prepare("SELECT value FROM system_settings WHERE key='saha_qr_enforcement'").get()?.value
  return ENFORCEMENT.has(value) ? value : 'off'
}

// Okutma yalnız etiketi doğrulanmış ve güncel (asılı QR = aktif QR) kapıda istenir; etiket yoksa kimse engellenmez.
export const qrRequiredFor = (db, key) => fieldQrEnforcement(db) === 'verified_labels' && labelState(db, key) === 'verified'
