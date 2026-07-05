import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'

// I1 — Sertifika vade taraması: 60/30/14/7/1 gün kala ve vade günü bildirim üretir.
// Cron günde bir çalıştığı için her eşik tek kez tetiklenir; dedup_key aynı gün
// içindeki tekrar çalıştırmaları (sunucu restart) engeller.
export const CERT_WARN_THRESHOLDS = [60, 30, 14, 7, 1, 0]

export function checkCertExpiries(today = new Date().toISOString().slice(0, 10)) {
  const db = getDB()
  const rows = db.prepare(`
    SELECT a.id as attendance_id, a.cert_expires_at,
      t.title, s.id as staff_id, s.full_name,
      CAST(julianday(a.cert_expires_at) - julianday(?) AS INTEGER) as days_left
    FROM training_attendances a
    JOIN training_sessions t ON t.id = a.session_id
    JOIN staff s ON s.id = a.staff_id
    WHERE a.cert_expires_at IS NOT NULL
      AND a.attended = 1
      AND s.is_active = 1
      AND a.cert_expires_at <= date(?, '+60 days')
  `).all(today, today)

  let created = 0
  rows.forEach(r => {
    if (!CERT_WARN_THRESHOLDS.includes(r.days_left)) return
    const msg = r.days_left <= 0
      ? `Sertifika vadesi doldu: ${r.full_name} — ${r.title} (${r.cert_expires_at})`
      : `Sertifika vadesine ${r.days_left} gün: ${r.full_name} — ${r.title} (${r.cert_expires_at})`
    const n = createNotification({
      message: msg,
      type: r.days_left <= 7 ? 'critical' : 'warning',
      module: 'safety',
      target_role: 'campus_manager',
      dedup_key: `cert_expiry_${r.attendance_id}_${r.days_left}_${today}`,
    })
    if (n) created += 1
  })
  return created
}
