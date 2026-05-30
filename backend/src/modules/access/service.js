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

// Anti-passback: son İKİ ok'lu hareketi AYNI yön olanlar (giriş-giriş veya
// çıkış-çıkış) — kart paylaşımı/turnike atlama şüphesi. Window function ile
// her sahip için en yeni 2 olayı sıralayıp karşılaştırır.
export function getPassbackAnomalies(db) {
  return db.prepare(`
    WITH ranked AS (
      SELECT holder_type, holder_id, event_type, scanned_at,
        ROW_NUMBER() OVER (
          PARTITION BY holder_type, holder_id
          ORDER BY scanned_at DESC, id DESC
        ) AS rn
      FROM access_events
      WHERE result='ok' AND event_type IN ('entry','exit') AND holder_id IS NOT NULL
    )
    SELECT a.holder_type, a.holder_id, a.event_type AS last_dir, a.scanned_at AS since,
      CASE a.holder_type
        WHEN 'staff' THEN (SELECT full_name FROM staff WHERE id=a.holder_id)
        WHEN 'personnel' THEN (SELECT full_name FROM personnel WHERE id=a.holder_id)
        WHEN 'visitor' THEN (SELECT full_name FROM visitors WHERE id=a.holder_id)
      END AS full_name
    FROM ranked a
    JOIN ranked b
      ON b.holder_type=a.holder_type AND b.holder_id=a.holder_id AND b.rn=2
    WHERE a.rn=1 AND a.event_type=b.event_type
    ORDER BY a.scanned_at DESC
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
