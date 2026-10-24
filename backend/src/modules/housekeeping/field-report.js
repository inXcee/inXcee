// Web "Saha takibi" (docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md §Hedefler 7): o gün kim kaç yeri temizledi,
// kaçı kapıdaki QR ile doğrulandı; blok başına etiket kapsaması ve açık yanlış-kapı kayıtları; QR zorunluluk anahtarı.
import { getDB } from '../../shared/db/index.js'
import { fieldQrEnforcement, labelStates } from '../location-portal/field-scan.js'
import { localToday } from './queries.js'

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode })
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MODES = new Set(['off', 'verified_labels'])

export function fieldReport({ date } = {}, db = getDB()) {
  const day = date ?? localToday(db)
  if (!DATE.test(String(day))) throw fail('Tarih YYYY-MM-DD olmalı', 400)
  // Her işaretli görev ayrı bir iş: şikayet sonrası başkası yeniden temizlese de ilk temizleyenin emeği sayılır.
  // İşareti yapan saha personeli; yoksa (eski portal akışı) tamamlayan personel.
  const workers = db.prepare(`
    SELECT s.id AS worker_id, s.full_name,
           SUM(ct.completed_at IS NOT NULL) AS cleaned,
           SUM(ct.skipped=1 AND ct.completed_at IS NULL) AS skipped,
           SUM(ct.completed_at IS NOT NULL AND ct.verified_by_qr=1) AS qr_verified,
           MIN(ct.completed_at) AS first_at, MAX(ct.completed_at) AS last_at
    FROM cleaning_tasks ct
    JOIN staff s ON s.id=COALESCE(ct.field_worker_id, ct.completed_by_worker_id)
    WHERE DATE(ct.scheduled_at)=? AND (ct.completed_at IS NOT NULL OR ct.skipped=1)
    GROUP BY s.id
    ORDER BY cleaned DESC, s.full_name
  `).all(day)

  const locations = db.prepare('SELECT block, qr_location FROM service_locations WHERE is_active=1 ORDER BY block').all()
  const states = labelStates(db, locations.map(l => l.qr_location))
  const blocks = new Map()
  for (const { block, qr_location: key } of locations) {
    if (!blocks.has(block)) {
      blocks.set(block, { block, locations: 0, verified: 0, installed: 0, printed: 0, stale: 0, damaged: 0, removed: 0, none: 0 })
    }
    const row = blocks.get(block)
    const state = states.get(key)
    row.locations += 1
    row[state in row ? state : 'none'] += 1
  }

  const mismatches = db.prepare('SELECT COUNT(*) AS c FROM location_qr_verify_mismatches WHERE resolved_at IS NULL').get().c
  return { date: day, enforcement: fieldQrEnforcement(db), workers, blocks: [...blocks.values()], mismatches_open: mismatches }
}

export function setFieldQrEnforcement(mode, userId, db = getDB()) {
  if (!MODES.has(mode)) throw fail('Geçersiz mod', 400)
  const before = fieldQrEnforcement(db)
  db.transaction(() => {
    db.prepare(`
      INSERT INTO system_settings(key, value, updated_at) VALUES('saha_qr_enforcement', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
    `).run(mode)
    db.prepare(`
      INSERT INTO audit_log(user_id, action, module, target_id, detail) VALUES(?, 'saha_qr_enforcement_change', 'housekeeping', NULL, ?)
    `).run(userId, JSON.stringify({ before, after: mode }))
  })()
  return { enforcement: mode }
}
