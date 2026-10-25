// Doluluk geçmişi (docs/saha-ekrani.md → "Doluluk geçmişi"): saha doluluğu (rooms.occupancy) anlıktır; günün durumu
// room_occupancy_daily'ye blok başına yazılır (saatlik cron, günün son yazımı kalır). Bugün her zaman CANLI okunur,
// geçmiş günler anlık görüntüden; görüntüsü olmayan gün boş (null) kalır — sıfır diye çizilmez.
// Oran panelle aynı: dolu / (dolu + boş), kapalı odalar paydaya girmez; bilinmeyen ayrı söylenir.
import { getDB } from '../../shared/db/index.js'
import { addDays, istanbulDate, istanbulDayBoundsUtc } from '../../shared/time.js'

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode })
const DATE = /^\d{4}-\d{2}-\d{2}$/
const COUNTS = ['rooms', 'closed', 'occupied', 'empty', 'unknown']
export const MAX_TREND_DAYS = 180
export const STALE_DAYS = 14

const pctOf = c => (c.occupied + c.empty > 0 ? Math.round(c.occupied * 100 / (c.occupied + c.empty)) : null)

// Toplam + oran + kapsama (durumu bilinen / kapalı olmayan oda)
export function totalsOf(rows) {
  const t = Object.fromEntries(COUNTS.map(k => [k, 0]))
  for (const r of rows) for (const k of COUNTS) t[k] += Number(r[k] || 0)
  const usable = t.rooms - t.closed
  return { ...t, pct: pctOf(t), coverage: usable > 0 ? Math.round((t.occupied + t.empty) * 100 / usable) : null }
}

function liveBlocks(db, block = null) {
  return db.prepare(`
    SELECT block, COUNT(*) AS rooms,
      COALESCE(SUM(use_state='closed'), 0) AS closed,
      COALESCE(SUM(use_state!='closed' AND occupancy='occupied'), 0) AS occupied,
      COALESCE(SUM(use_state!='closed' AND occupancy='empty'), 0) AS empty,
      COALESCE(SUM(use_state!='closed' AND occupancy IS NULL), 0) AS unknown
    FROM rooms WHERE status='active' AND (? IS NULL OR block=?)
    GROUP BY block ORDER BY block
  `).all(block, block)
}

// Günün satırlarını şimdiki durumla yeniden yazar (tekrar çalıştırmak güvenli). Artık olmayan bloğun o günkü satırı
// silinir; geçmiş günlere dokunulmaz.
export function captureOccupancySnapshot({ day = istanbulDate() } = {}, db = getDB()) {
  if (!DATE.test(String(day))) throw fail('Tarih YYYY-MM-DD olmalı', 400)
  const blocks = liveBlocks(db)
  db.transaction(() => {
    db.prepare('DELETE FROM room_occupancy_daily WHERE day=?').run(day)
    const insert = db.prepare(`
      INSERT INTO room_occupancy_daily(day, block, rooms, closed, occupied, empty, unknown, captured_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const b of blocks) insert.run(day, b.block, b.rooms, b.closed, b.occupied, b.empty, b.unknown)
  })()
  return { day, blocks: blocks.length, totals: totalsOf(blocks) }
}

function snapshotRows(db, from, to, block) {
  return db.prepare(`
    SELECT day, block, rooms, closed, occupied, empty, unknown, captured_at FROM room_occupancy_daily
    WHERE day >= ? AND day <= ? AND (? IS NULL OR block=?) ORDER BY day, block
  `).all(from, to, block, block)
}

// Bir günün doluluğu: bugün canlı, geçmiş gün anlık görüntüden. Görüntü yoksa null.
export function occupancyOnDay(day, { block = null } = {}, db = getDB()) {
  const today = istanbulDate()
  if (day === today) {
    const blocks = liveBlocks(db, block)
    return { day, source: 'live', blocks, ...totalsOf(blocks) }
  }
  const blocks = snapshotRows(db, day, day, block)
  if (!blocks.length) return null
  return { day, source: 'snapshot', captured_at: blocks.reduce((m, b) => (b.captured_at > m ? b.captured_at : m), ''), blocks, ...totalsOf(blocks) }
}

// Son n günün serisi (bugün dahil, en eski önce). Özet: son değer, 7 gün önceye göre fark (iki uç da biliniyorsa),
// görüntülü günlerin ortalaması / en düşük / en yüksek.
export function occupancyTrend({ days = 30, block = null } = {}, db = getDB()) {
  const n = Math.max(1, Math.min(MAX_TREND_DAYS, Math.trunc(Number(days)) || 30))
  const to = istanbulDate()
  const from = addDays(to, -(n - 1))
  const byDay = new Map()
  for (const r of snapshotRows(db, from, addDays(to, -1), block)) {
    if (!byDay.has(r.day)) byDay.set(r.day, [])
    byDay.get(r.day).push(r)
  }
  const live = liveBlocks(db, block)
  const series = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rows = d === to ? live : byDay.get(d)
    series.push(rows ? { date: d, captured: true, live: d === to, ...totalsOf(rows) } : {
      date: d, captured: false, live: false, rooms: null, closed: null, occupied: null, empty: null, unknown: null, pct: null, coverage: null,
    })
  }
  const known = series.filter(p => p.pct !== null)
  const latest = series[series.length - 1]
  const weekAgo = series.find(p => p.date === addDays(to, -7))
  return {
    from, to, days: n, block,
    series,
    summary: {
      pct: latest.pct,
      change_7d: latest.pct !== null && weekAgo?.pct != null ? latest.pct - weekAgo.pct : null,
      avg: known.length ? Math.round(known.reduce((s, p) => s + p.pct, 0) / known.length) : null,
      min: known.length ? Math.min(...known.map(p => p.pct)) : null,
      max: known.length ? Math.max(...known.map(p => p.pct)) : null,
      days_with_data: known.length,
    },
  }
}

// Durumu bilinen ama staleDays gündür kimsenin teyit etmediği odalar (dolu/boş bilgisi eskimiş olabilir)
export function staleOccupancy({ staleDays = STALE_DAYS, block = null } = {}, db = getDB()) {
  const n = Math.max(1, Math.trunc(Number(staleDays)) || STALE_DAYS)
  const rows = db.prepare(`
    SELECT block, COUNT(*) AS stale FROM rooms
    WHERE status='active' AND use_state!='closed' AND occupancy IS NOT NULL
      AND (occupancy_updated_at IS NULL OR occupancy_updated_at < datetime('now', ?))
      AND (? IS NULL OR block=?)
    GROUP BY block ORDER BY block
  `).all(`-${n} days`, block, block)
  return { stale_days: n, total: rows.reduce((s, r) => s + r.stale, 0), blocks: rows }
}

// Günün doluluk değişiklikleri (denetim kaydından): kaç kez değişti, kaçı ilk kez bilgi girildi, kaçı dolu/boş oldu
export function occupancyChanges(day = istanbulDate(), db = getDB()) {
  const { from, to } = istanbulDayBoundsUtc(day)
  const rows = db.prepare(`
    SELECT json_extract(detail, '$.before') AS before, json_extract(detail, '$.after') AS after
    FROM audit_log WHERE action='room_occupancy_change' AND created_at >= ? AND created_at < ?
  `).all(from, to)
  return {
    total: rows.length,
    first_entry: rows.filter(r => r.before === null && r.after !== null).length,
    to_occupied: rows.filter(r => r.after === 'occupied').length,
    to_empty: rows.filter(r => r.after === 'empty').length,
    cleared: rows.filter(r => r.after === null).length,
  }
}
