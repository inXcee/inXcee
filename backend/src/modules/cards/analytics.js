import { getDB } from '../../shared/db/index.js'

const CARD_TYPES = ['access', 'meal']

/**
 * Kart tipi başına durum sayımı + NFC enrollment ilerlemesi + personel kapsamı.
 */
export function summary(db = getDB()) {
  const totalActiveStaff = db.prepare('SELECT COUNT(*) AS c FROM staff WHERE is_active=1').get().c

  return CARD_TYPES.map(card_type => {
    const counts = db.prepare(`
      SELECT
        SUM(CASE WHEN status='active'  THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status='lost'    THEN 1 ELSE 0 END) AS lost,
        SUM(CASE WHEN status='revoked' THEN 1 ELSE 0 END) AS revoked,
        SUM(CASE WHEN status='active' AND nfc_uid IS NOT NULL THEN 1 ELSE 0 END) AS nfc_bound
      FROM cards WHERE card_type=?
    `).get(card_type)

    // Kapsam: o tipte aktif kartı olan aktif staff sayısı / toplam aktif staff
    const covered = db.prepare(`
      SELECT COUNT(*) AS c FROM staff s
      WHERE s.is_active=1
        AND EXISTS (SELECT 1 FROM cards c WHERE c.holder_type='staff' AND c.holder_id=s.id AND c.card_type=? AND c.status='active')
    `).get(card_type).c

    return {
      card_type,
      active: counts.active || 0,
      lost: counts.lost || 0,
      revoked: counts.revoked || 0,
      nfc_bound: counts.nfc_bound || 0,
      coverage_pct: totalActiveStaff > 0 ? Math.round((covered / totalActiveStaff) * 100) : 0,
    }
  })
}

/**
 * Son `days` günün her biri için okutma sayısı (toplam + ok). Boş günler 0 ile dolu.
 */
export function usageByDay(db = getDB(), days = 14) {
  const rows = db.prepare(`
    SELECT date(scanned_at) AS day,
      COUNT(*) AS total,
      SUM(CASE WHEN result='ok' THEN 1 ELSE 0 END) AS ok
    FROM access_events
    WHERE scanned_at >= date('now', ?)
    GROUP BY date(scanned_at)
  `).all(`-${days - 1} days`)
  const byDay = new Map(rows.map(r => [r.day, r]))

  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const r = byDay.get(day)
    out.push({ day, total: r ? r.total : 0, ok: r ? (r.ok || 0) : 0 })
  }
  return out
}

/**
 * Son `days` günde okutma sonucu kırılımı (ok/denied/...). count>0 olanlar.
 */
export function usageByResult(db = getDB(), days = 30) {
  return db.prepare(`
    SELECT result, COUNT(*) AS count
    FROM access_events
    WHERE scanned_at >= date('now', ?)
    GROUP BY result
    ORDER BY count DESC
  `).all(`-${days - 1} days`)
}

/**
 * Son `days` günün en yoğun ilk 8 istasyonu.
 */
export function topStations(db = getDB(), days = 30) {
  return db.prepare(`
    SELECT e.station_id, st.name, COUNT(*) AS count
    FROM access_events e
    LEFT JOIN scan_stations st ON st.id = e.station_id
    WHERE e.scanned_at >= date('now', ?)
      AND e.station_id IS NOT NULL
    GROUP BY e.station_id
    ORDER BY count DESC
    LIMIT 8
  `).all(`-${days - 1} days`)
}
