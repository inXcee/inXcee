import { getDB } from '../../shared/db/index.js'
import { memoize } from '../../shared/middleware/memo.js'
import { getOverdueInside } from '../access/service.js'

function _getKPI() {
  const db = getDB()
  const active_personnel = db.prepare("SELECT COUNT(*) as c FROM personnel WHERE check_out_date IS NULL AND check_in_date IS NOT NULL").get().c
  const total_beds = db.prepare("SELECT SUM(active_beds) as s FROM rooms WHERE status='active'").get().s || 0
  const occupied = db.prepare("SELECT COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL").get().c
  const occupancy_pct = total_beds > 0 ? Math.round((occupied / total_beds) * 100) : 0
  const open_maintenance = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='open'").get().c
  const quarantine_rooms = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE status='quarantine'").get().c
  return { active_personnel, occupancy_pct, open_maintenance, quarantine_rooms, occupied, total_beds }
}
export const getKPI = memoize(_getKPI, 30_000)

function _getHeatmap() {
  const db = getDB()
  return db.prepare(`
    SELECT r.block,
      SUM(r.active_beds) as total_beds,
      COUNT(ra.id) as occupied,
      MIN(r.status) as status,
      ROUND(COUNT(ra.id) * 100.0 / MAX(SUM(r.active_beds), 1)) as pct
    FROM rooms r
    LEFT JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    GROUP BY r.block
    ORDER BY r.block
  `).all()
}
export const getHeatmap = memoize(_getHeatmap, 60_000)

function _getBedOccupancy() {
  const db = getDB()
  const blocks = db.prepare(`
    SELECT r.block,
      COUNT(r.id) as total_rooms,
      SUM(r.capacity) as total_capacity,
      SUM(r.active_beds) as total_beds,
      COUNT(CASE WHEN r.status='active' THEN 1 END) as active_rooms,
      COUNT(CASE WHEN r.status='maintenance' THEN 1 END) as maintenance_rooms,
      COUNT(CASE WHEN r.status='quarantine' THEN 1 END) as quarantine_rooms
    FROM rooms r
    GROUP BY r.block
    ORDER BY r.block
  `).all()

  const occupancy = db.prepare(`
    SELECT r.block,
      COUNT(ra.id) as occupied_beds
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    WHERE ra.check_out_at IS NULL
    GROUP BY r.block
  `).all()

  const occMap = Object.fromEntries(occupancy.map(o => [o.block, o.occupied_beds]))

  const totals = { total_rooms: 0, total_capacity: 0, total_beds: 0, occupied: 0, active_rooms: 0, maintenance_rooms: 0, quarantine_rooms: 0 }

  const result = blocks.map(b => {
    const occ = occMap[b.block] || 0
    const empty = (b.total_beds || 0) - occ
    const pct = b.total_beds > 0 ? Math.round((occ / b.total_beds) * 100) : 0
    totals.total_rooms += b.total_rooms
    totals.total_capacity += b.total_capacity
    totals.total_beds += b.total_beds || 0
    totals.occupied += occ
    totals.active_rooms += b.active_rooms
    totals.maintenance_rooms += b.maintenance_rooms
    totals.quarantine_rooms += b.quarantine_rooms
    return { ...b, occupied: occ, empty, pct }
  })

  totals.empty = totals.total_beds - totals.occupied
  totals.pct = totals.total_beds > 0 ? Math.round((totals.occupied / totals.total_beds) * 100) : 0

  return { blocks: result, totals }
}
export const getBedOccupancy = memoize(_getBedOccupancy, 60_000)

export function getProjection() {
  const db = getDB()
  const leaving = db.prepare(`
    SELECT COUNT(*) as c, r.block
    FROM personnel p
    JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    JOIN rooms r ON r.id=ra.room_id
    WHERE p.check_out_date BETWEEN datetime('now') AND datetime('now','+14 days')
    GROUP BY r.block
  `).all()
  return leaving
}

export function getAuditLog(limit = 50, { action, module, user_id, date_from, date_to, search } = {}) {
  const db = getDB()
  let q = `SELECT a.*, u.full_name as user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE 1=1`
  const params = []
  if (action) { q += ' AND a.action=?'; params.push(action) }
  if (module) { q += ' AND a.module=?'; params.push(module) }
  if (user_id) { q += ' AND a.user_id=?'; params.push(user_id) }
  if (date_from) { q += ' AND DATE(a.created_at)>=?'; params.push(date_from) }
  if (date_to) { q += ' AND DATE(a.created_at)<=?'; params.push(date_to) }
  if (search) { q += ' AND (a.detail LIKE ? OR u.full_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  q += ' ORDER BY a.created_at DESC LIMIT ?'
  params.push(limit)
  return db.prepare(q).all(...params)
}

// ── Export queries (#4) ──────────────────────────────────────────────────────

export function exportPersonnel() {
  const db = getDB()
  return db.prepare(`
    SELECT p.full_name, p.tc_no, p.company, p.job_title, p.hometown,
      r.block, r.floor, r.room_no, ra.bed_no, s.shift_type,
      p.discipline_points, p.check_in_date
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.check_out_date IS NULL
    ORDER BY p.full_name
  `).all()
}

export function exportOccupancy() {
  const db = getDB()
  return db.prepare(`
    SELECT r.block, r.floor, r.room_no, r.capacity, r.active_beds, r.status,
      COUNT(ra.id) as occupied
    FROM rooms r
    LEFT JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    GROUP BY r.id
    ORDER BY r.block, r.floor, CAST(r.room_no AS INTEGER)
  `).all()
}

export function exportMaintenance() {
  const db = getDB()
  return db.prepare(`
    SELECT mr.location, mr.description, mr.status, mr.priority,
      mr.wait_reason, mr.opened_at, mr.closed_at, u.full_name as reporter
    FROM maintenance_requests mr
    LEFT JOIN users u ON u.id=mr.reporter_user_id
    ORDER BY mr.opened_at DESC
  `).all()
}

// ── Health Score ────────────────────────────────────────────────────────────

function _getHealthScore() {
  const db = getDB()

  // Doluluk skoru: 100 - |85 - actual%|, hedef %85
  const totalBeds = db.prepare("SELECT COALESCE(SUM(active_beds), 0) as t FROM rooms WHERE status='active'").get().t
  const occupied = db.prepare("SELECT COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL").get().c
  const occPct = totalBeds > 0 ? Math.round(occupied * 100 / totalBeds) : 0
  const occupancyScore = Math.max(0, 100 - Math.abs(85 - occPct))

  // SLA skoru: son 30 gün SLA uyum yüzdesi
  const slaRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN sla_deadline >= closed_at THEN 1 END) as ontime
    FROM maintenance_requests
    WHERE status='done' AND closed_at >= date('now', '-30 days') AND sla_deadline IS NOT NULL
  `).get()
  const slaScore = slaRow.total === 0 ? 100 : Math.round(slaRow.ontime * 100 / slaRow.total)

  // Temizlik skoru: son 7 gün tamamlanma yüzdesi
  const hkRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) as done
    FROM cleaning_tasks
    WHERE DATE(scheduled_at) >= date('now', '-7 days') AND DATE(scheduled_at) <= date('now')
  `).get()
  const housekeepingScore = hkRow.total === 0 ? 100 : Math.round(hkRow.done * 100 / hkRow.total)

  // Arıza skoru: 0 açık = 100, 10+ = 0, doğrusal
  const openMaint = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='open'").get().c
  const maintenanceScore = Math.max(0, 100 - openMaint * 10)

  // Disiplin skoru: aktif kara liste sayısı × 5 cezalandır
  let disciplineScore = 100
  try {
    const blacklistCount = db.prepare(
      "SELECT COUNT(*) as c FROM blacklist WHERE active = 1"
    ).get()?.c ?? 0
    disciplineScore = Math.max(0, 100 - blacklistCount * 5)
  } catch (e) {
    // blacklist tablosu yoksa 100 varsay
    disciplineScore = 100
  }

  const breakdown = [
    { label: 'DOLULUK',  value: occupancyScore,    weight: 0.30 },
    { label: 'SLA',      value: slaScore,          weight: 0.25 },
    { label: 'TEMİZLİK', value: housekeepingScore, weight: 0.20 },
    { label: 'ARIZA',    value: maintenanceScore,  weight: 0.15 },
    { label: 'DİSİPLİN', value: disciplineScore,   weight: 0.10 },
  ]

  const score = Math.round(breakdown.reduce((s, c) => s + c.value * c.weight, 0))
  const color = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red'

  return { score, breakdown, color }
}
export const getHealthScore = memoize(_getHealthScore, 60_000)

// ── Anomaly Detection ───────────────────────────────────────────────────────

function _getAnomalies() {
  const db = getDB()
  const anomalies = []

  // R1: Blok arıza yoğunluğu — bir blokta bugünkü açık arıza sayısı
  // son 7 günün ortalamasının ≥2 katı VE bugün ≥3 yeni arıza
  const maintByBlock = db.prepare(`
    WITH today_counts AS (
      SELECT
        SUBSTR(location, 1, INSTR(location || ' ', ' ') - 1) AS block,
        COUNT(*) AS today_count
      FROM maintenance_requests
      WHERE DATE(opened_at) = DATE('now')
      GROUP BY block
    ),
    week_avg AS (
      SELECT
        SUBSTR(location, 1, INSTR(location || ' ', ' ') - 1) AS block,
        COUNT(*) * 1.0 / 7.0 AS avg_per_day
      FROM maintenance_requests
      WHERE DATE(opened_at) >= DATE('now', '-7 days') AND DATE(opened_at) < DATE('now')
      GROUP BY block
    )
    SELECT t.block, t.today_count, COALESCE(w.avg_per_day, 0) AS avg_7d
    FROM today_counts t
    LEFT JOIN week_avg w ON w.block = t.block
    WHERE t.today_count >= 3 AND t.today_count >= COALESCE(w.avg_per_day, 0) * 2
  `).all()

  for (const row of maintByBlock) {
    if (!row.block) continue
    anomalies.push({
      id: `maint-density-${row.block}`,
      severity: 'warning',
      title: `${row.block} bloğunda arıza yoğunluğu yüksek`,
      detail: `Son 7 gün ortalaması ${row.avg_7d.toFixed(1)}/gün, bugün ${row.today_count} yeni kayıt`,
      action_path: `/maintenance?block=${row.block}`,
    })
  }

  // R3: Temizlik gecikmesi — bugün 3+ saat bekleyen tamamlanmamış görev
  const lateHk = db.prepare(`
    SELECT COUNT(*) AS c
    FROM cleaning_tasks
    WHERE completed_at IS NULL
      AND skipped = 0
      AND scheduled_at <= datetime('now', '-3 hours')
      AND DATE(scheduled_at) = DATE('now')
  `).get()
  if (lateHk.c > 0) {
    anomalies.push({
      id: 'hk-late',
      severity: lateHk.c >= 10 ? 'critical' : 'warning',
      title: 'Temizlik görevleri gecikiyor',
      detail: `${lateHk.c} görev 3 saatten fazla bekliyor`,
      action_path: '/housekeeping',
    })
  }

  // R4: Uzun karantina — audit_log üzerinden son room_quarantine kaydı 48+ saat önce
  // ve oda hâlâ karantina statüsünde
  const longQuarantine = db.prepare(`
    SELECT r.block, r.room_no,
      (SELECT MAX(created_at) FROM audit_log
        WHERE action='room_quarantine'
          AND detail LIKE '%' || r.block || '%' || r.room_no || '%') AS last_q
    FROM rooms r
    WHERE r.status = 'quarantine'
  `).all()
  for (const r of longQuarantine) {
    if (!r.last_q) continue
    const hoursSince = (Date.now() - new Date(r.last_q.replace(' ', 'T') + 'Z').getTime()) / 3600000
    if (hoursSince >= 48) {
      anomalies.push({
        id: `qua-long-${r.block}-${r.room_no}`,
        severity: 'warning',
        title: `${r.block}-${r.room_no} karantinası uzun sürüyor`,
        detail: `${Math.round(hoursSince)} saattir karantinada`,
        action_path: `/capacity?block=${r.block}`,
      })
    }
  }

  // R2: Ani doluluk düşüşü — bugün çıkış sayısı son 7 gün ortalamasının ≥3 katı
  // ve bugün ≥5 çıkış
  const occRow = db.prepare(`
    WITH today_out AS (
      SELECT COUNT(*) AS c FROM personnel
      WHERE DATE(check_out_date) = DATE('now')
    ),
    week_avg AS (
      SELECT COUNT(*) * 1.0 / 7.0 AS avg_out FROM personnel
      WHERE DATE(check_out_date) >= DATE('now', '-7 days') AND DATE(check_out_date) < DATE('now')
    )
    SELECT t.c AS today_out, COALESCE(w.avg_out, 0) AS avg_out
    FROM today_out t, week_avg w
  `).get()
  if (occRow.today_out >= 5 && occRow.today_out >= occRow.avg_out * 3) {
    anomalies.push({
      id: 'occ-drop',
      severity: 'warning',
      title: 'Doluluk hızla düşüyor',
      detail: `Bugün ${occRow.today_out} çıkış (7 gün ort. ${occRow.avg_out.toFixed(1)})`,
      action_path: '/checkin',
    })
  }

  // R5 (Faz 6.2): Bugün kara liste alarmı — istasyonda kara listeli kart okutuldu
  const alarmRow = db.prepare(`
    SELECT COUNT(*) AS c FROM access_events
    WHERE result='alarm' AND DATE(scanned_at) = DATE('now')
  `).get()
  if (alarmRow.c > 0) {
    anomalies.push({
      id: 'access-blacklist-today',
      severity: 'critical',
      title: 'Kara listedeki kişi okutma yaptı',
      detail: `Bugün ${alarmRow.c} alarm — istasyonda kara listeli kart okutuldu`,
      action_path: '/presence',
    })
  }

  // R6 (Faz 6.2): Çıkış yapmadan uzun süre içeride kalanlar (16+ saat)
  const overdue = getOverdueInside(db, 16)
  if (overdue.length > 0) {
    anomalies.push({
      id: 'access-overdue-inside',
      severity: 'warning',
      title: 'Çıkış yapmadan uzun süre içeride',
      detail: `${overdue.length} kişi 16+ saattir çıkış yapmadı`,
      action_path: '/presence',
    })
  }

  return { anomalies }
}
export const getAnomalies = memoize(_getAnomalies, 120_000)

// ── Trend queries ─────────────────────────────────────────────────────────────

export function getTrends(metrics, days = 30) {
  const db = getDB()
  const n = Math.max(1, Math.min(90, Number(days) || 30))

  const dateSeries = db.prepare(`
    WITH RECURSIVE dates(d) AS (
      SELECT date('now', '-' || (? - 1) || ' days')
      UNION ALL
      SELECT date(d, '+1 day') FROM dates WHERE d < date('now')
    )
    SELECT d FROM dates
  `).all(n).map(r => r.d)

  const result = {}
  const allowed = ['occupancy', 'sla', 'housekeeping', 'checkins']

  for (const metric of metrics) {
    if (!allowed.includes(metric)) continue

    if (metric === 'occupancy') {
      const totalBeds = db.prepare(
        `SELECT COALESCE(SUM(active_beds), 1) as t FROM rooms WHERE status='active'`
      ).get().t
      // NOTE: denominator is current active bed count — historical room changes not tracked
      const occupancyStmt = db.prepare(
        `SELECT COUNT(*) as c FROM room_assignments
         WHERE date(assigned_at) <= ? AND (check_out_at IS NULL OR date(check_out_at) > ?)`
      )
      result.occupancy = dateSeries.map(d => ({
        date: d,
        value: Math.round(occupancyStmt.get(d, d).c * 100 / totalBeds),
      }))
    }

    if (metric === 'sla') {
      // NOTE: Only counts requests with an explicit sla_deadline (NULL = no SLA set).
      // This means trend % reflects tracked-SLA requests only — intentionally different
      // from the PDF report's overdue count which uses a different time window (last 7 days).
      const slaStmt = db.prepare(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN sla_deadline >= closed_at THEN 1 END) as ontime
        FROM maintenance_requests
        WHERE status='done' AND date(closed_at) = ? AND sla_deadline IS NOT NULL
      `)
      result.sla = dateSeries.map(d => {
        const row = slaStmt.get(d)
        return {
          date: d,
          value: row.total === 0 ? 100 : Math.round(row.ontime * 100 / row.total),
        }
      })
    }

    if (metric === 'housekeeping') {
      const housekeepingStmt = db.prepare(
        `SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) as done
         FROM cleaning_tasks
         WHERE DATE(scheduled_at) = ?`
      )
      result.housekeeping = dateSeries.map(d => {
        const row = housekeepingStmt.get(d)
        return {
          date: d,
          value: row.total === 0 ? 100 : Math.round(row.done * 100 / row.total),
        }
      })
    }

    if (metric === 'checkins') {
      const rows = db.prepare(`
        WITH RECURSIVE dates(d) AS (
          SELECT date('now', '-' || (? - 1) || ' days')
          UNION ALL
          SELECT date(d, '+1 day') FROM dates WHERE d < date('now')
        )
        SELECT d.d AS date,
          COALESCE(SUM(CASE WHEN date(p.check_in_date)  = d.d THEN 1 ELSE 0 END), 0) AS "in",
          COALESCE(SUM(CASE WHEN date(p.check_out_date) = d.d THEN 1 ELSE 0 END), 0) AS "out"
        FROM dates d
        LEFT JOIN personnel p
          ON date(p.check_in_date) = d.d OR date(p.check_out_date) = d.d
        GROUP BY d.d
        ORDER BY d.d
      `).all(n)
      result.checkins = rows
    }
  }

  return result
}
