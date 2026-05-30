// Erişim kontrolü (Faz 5) — presence & anomaliler access_events'ten TÜRETİLİR.
// Ayrı bir "mevcudiyet" tablosu tutulmaz; her okutma zaten access_events'te.

// Her sahip için EN SON ok'lu giriş/çıkış olayını bulan ortak alt sorgu.
// Sıralama: scanned_at (datetime metni leksikografik sıralanır) + id (eşitlik kırıcı,
// sıfır-dolgulu ki metin karşılaştırması sayısal sırayı korusun).
const LATEST_EVENT_JOIN = `
  JOIN (
    SELECT holder_type, holder_id, MAX(scanned_at || '#' || printf('%012d', id)) AS mx
    FROM access_events
    WHERE result='ok' AND event_type IN ('entry','exit') AND holder_id IS NOT NULL
    GROUP BY holder_type, holder_id
  ) last
    ON last.holder_type = e.holder_type AND last.holder_id = e.holder_id
   AND (e.scanned_at || '#' || printf('%012d', e.id)) = last.mx
`

const HOLDER_NAME = `
  CASE e.holder_type
    WHEN 'staff' THEN (SELECT full_name FROM staff WHERE id = e.holder_id)
    WHEN 'personnel' THEN (SELECT full_name FROM personnel WHERE id = e.holder_id)
  END AS full_name
`

// Şu an kampüste olanlar: son hareketi 'entry' olan herkes.
export function getPresence(db) {
  return db.prepare(`
    SELECT e.holder_type, e.holder_id, e.scanned_at AS since, ${HOLDER_NAME}
    FROM access_events e
    ${LATEST_EVENT_JOIN}
    WHERE e.event_type = 'entry'
    ORDER BY e.scanned_at DESC
  `).all()
}

// Çıkışsız uzun süre içeride kalanlar (son girişi N saatten eski, hâlâ içeride).
export function getOverdueInside(db, hours = 16) {
  return db.prepare(`
    SELECT e.holder_type, e.holder_id, e.scanned_at AS since, ${HOLDER_NAME},
      CAST((julianday('now') - julianday(e.scanned_at)) * 24 AS INTEGER) AS hours_inside
    FROM access_events e
    ${LATEST_EVENT_JOIN}
    WHERE e.event_type = 'entry'
      AND e.scanned_at < datetime('now', '-' || ? || ' hours')
    ORDER BY e.scanned_at ASC
  `).all(hours)
}
