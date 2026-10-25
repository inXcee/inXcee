// Akşam saha özeti (docs/saha-ekrani.md → "Hermes akşam özeti"): günün doluluk, temizlik, çamaşır ve sakin şikayeti
// durumu tek yanıtta. Hermes (Telegram) zamanlanmış görevle çağırır ve `text`'i olduğu gibi gönderir; metin sunucuda
// kurulur ki web, Telegram ve ileride e-posta aynı cümleyi söylesin. Hiçbir şey yazmaz.
// Sıfır tek başına yazılmaz: "işaret yok" ile "kayıt yok" ayrılır (bilinmeyen doluluk, görüntüsüz gün ayrı söylenir).
import { getDB } from '../../shared/db/index.js'
import { addDays, istanbulDate, istanbulDayBoundsUtc } from '../../shared/time.js'
import { fieldReport } from './field-report.js'
import { occupancyChanges, occupancyOnDay, staleOccupancy } from './occupancy-history.js'

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode })
const DATE = /^\d{4}-\d{2}-\d{2}$/
const OPEN_BAGS = "('dirty','washing','ironing')"
// Dikkat eşikleri — metinde de aynı sayılar söylenir
export const THRESHOLDS = { coverageLow: 50, readyWaitHours: 24, openBagHours: 48, pickupWaitHours: 12 }

const hoursSince = (utcText, now) => (utcText ? Math.floor((now - Date.parse(`${utcText.replace(' ', 'T')}Z`)) / 3_600_000) : null)
const signed = n => (n > 0 ? `+${n}` : String(n))
const trDate = day => { const [y, m, d] = day.split('-'); return `${d}.${m}.${y}` }

function occupancySection(db, day) {
  const now = occupancyOnDay(day, {}, db)
  const prev = occupancyOnDay(addDays(day, -1), {}, db)
  const live = day === istanbulDate()
  if (!now) return { available: false, day, source: null }
  const unknownBlocks = now.blocks
    .filter(b => b.unknown > 0)
    .sort((a, b) => b.unknown - a.unknown || a.block.localeCompare(b.block))
    .slice(0, 3)
    .map(b => ({ block: b.block, unknown: b.unknown }))
  return {
    available: true, day, source: now.source,
    occupied: now.occupied, empty: now.empty, unknown: now.unknown, closed: now.closed, pct: now.pct, coverage: now.coverage,
    prev_pct: prev?.pct ?? null,
    change_1d: now.pct !== null && prev?.pct != null ? now.pct - prev.pct : null,
    changes: occupancyChanges(day, db),
    // Bayatlık bugünün bilgisidir; geçmiş bir gün sorulunca söylenmez
    stale: live ? staleOccupancy({}, db).total : null,
    unknown_blocks: unknownBlocks,
  }
}

// Temizlik: sayımlarda her işaretli görev ayrı iştir (saha raporuyla aynı — şikayet sonrası yeniden temizlik ilk
// temizliği silmez). "İşaretsiz" ise yer başına geçerli (son) göreve bakar: bugün temizlenmesi beklenen (açık, temizlik
// istenmiyor değil, boş bilinmiyor) ama geçerli görevi ne temizlendi ne temizlenemedi olan oda. Kilitli/kapalı/boş beklenmez.
function cleaningSection(db, day) {
  const tasks = db.prepare(`
    SELECT id, qr_location, task_type, completed_at, skipped, skip_reason, verified_by_qr FROM cleaning_tasks
    WHERE DATE(scheduled_at)=? ORDER BY id
  `).all(day)
  const cleaned = tasks.filter(t => t.completed_at)
  const skipped = tasks.filter(t => !t.completed_at && t.skipped)
  const current = new Map(tasks.map(t => [t.qr_location, t]))
  const reasons = new Map()
  for (const t of skipped) {
    const label = String(t.skip_reason || 'Sebep yok').split(':')[0].trim()
    reasons.set(label, (reasons.get(label) || 0) + 1)
  }
  const marked = new Set([...current.values()].filter(t => t.completed_at || t.skipped).map(t => t.qr_location))
  const expected = db.prepare(`
    SELECT block, room_no FROM rooms
    WHERE status='active' AND use_state='open' AND no_clean=0 AND (occupancy IS NULL OR occupancy='occupied')
  `).all()
  const unmarkedByBlock = new Map()
  for (const r of expected) {
    if (marked.has(`${r.block}-${r.room_no}`)) continue
    unmarkedByBlock.set(r.block, (unmarkedByBlock.get(r.block) || 0) + 1)
  }
  const report = fieldReport({ date: day }, db)
  return {
    cleaned: cleaned.length,
    cleaned_rooms: cleaned.filter(t => t.task_type === 'room').length,
    skipped: skipped.length,
    qr_verified: cleaned.filter(t => t.verified_by_qr).length,
    qr_pct: cleaned.length ? Math.round(cleaned.filter(t => t.verified_by_qr).length * 100 / cleaned.length) : null,
    skip_reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    expected_rooms: expected.length,
    unmarked_rooms: [...unmarkedByBlock.values()].reduce((s, n) => s + n, 0),
    unmarked_blocks: [...unmarkedByBlock].map(([block, count]) => ({ block, count }))
      .sort((a, b) => b.count - a.count || a.block.localeCompare(b.block)).slice(0, 3),
    workers: report.workers.slice(0, 3).map(w => ({ full_name: w.full_name, cleaned: w.cleaned, skipped: w.skipped, qr_verified: w.qr_verified })),
    worker_count: report.workers.length,
    qr_mismatches_open: report.mismatches_open,
  }
}

// Çamaşır defteri: her laundry_items satırı bir torba (tekil kıyafet takipli torbalar hariç — Hermes /camasir ile aynı)
function laundrySection(db, day, nowMs) {
  const { from, to } = istanbulDayBoundsUtc(day)
  const bag = "tracking_mode!='individual'"
  const one = (sql, ...params) => db.prepare(sql).get(...params)
  const opened = one(`SELECT COUNT(*) c FROM laundry_items WHERE ${bag} AND created_at >= ? AND created_at < ?`, from, to).c
  // Hazıra alınan: o gün hazır geçmişi olan ve hâlâ hazır/teslim torba (geri alınan sayılmaz)
  const readied = one(`
    SELECT COUNT(DISTINCT h.item_id) c FROM laundry_history h JOIN laundry_items li ON li.id=h.item_id
    WHERE li.${bag} AND h.to_status='ready' AND h.created_at >= ? AND h.created_at < ? AND li.status IN ('ready','delivered')
  `, from, to).c
  const delivered = one(`SELECT COUNT(*) c FROM laundry_items WHERE ${bag} AND status='delivered' AND updated_at >= ? AND updated_at < ?`, from, to).c
  const open = one(`SELECT COUNT(*) c, MIN(created_at) oldest FROM laundry_items WHERE ${bag} AND status IN ${OPEN_BAGS}`)
  const ready = one(`SELECT COUNT(*) c, MIN(updated_at) oldest FROM laundry_items WHERE ${bag} AND status='ready'`)
  const readyLate = one(`
    SELECT COUNT(*) c FROM laundry_items WHERE ${bag} AND status='ready' AND updated_at < datetime('now', ?)
  `, `-${THRESHOLDS.readyWaitHours} hours`).c
  const urgent = one(`SELECT COUNT(*) c FROM laundry_items WHERE ${bag} AND status IN ${OPEN_BAGS} AND urgent=1`).c
  const requests = one(`SELECT COUNT(*) c, MIN(created_at) oldest FROM laundry_pickup_requests WHERE status='open'`)
  return {
    opened, readied, delivered,
    open_bags: open.c, open_oldest_hours: hoursSince(open.oldest, nowMs), urgent_open: urgent,
    ready_bags: ready.c, ready_oldest_hours: hoursSince(ready.oldest, nowMs), ready_late: readyLate,
    pickup_requests_open: requests.c, pickup_oldest_hours: hoursSince(requests.oldest, nowMs),
  }
}

function complaintsSection(db, day) {
  const { from, to } = istanbulDayBoundsUtc(day)
  const today = db.prepare(`
    SELECT COUNT(*) AS issues, AVG(rating) AS avg_rating FROM cleaning_task_reviews WHERE outcome='issue' AND created_at >= ? AND created_at < ?
  `).get(from, to)
  const approved = db.prepare(`
    SELECT COUNT(*) c FROM cleaning_task_reviews WHERE outcome='approved' AND created_at >= ? AND created_at < ?
  `).get(from, to).c
  // Takip görevi açık (henüz yeniden temizlenmemiş ya da temizlenemedi denmemiş) şikayetler — gün fark etmez
  const openFollowups = db.prepare(`
    SELECT COUNT(*) c FROM cleaning_task_reviews cr JOIN cleaning_tasks ct ON ct.id=cr.followup_task_id
    WHERE cr.outcome='issue' AND ct.completed_at IS NULL AND ct.skipped=0
  `).get().c
  return { issues: today.issues, approved, avg_rating: today.avg_rating == null ? null : Math.round(today.avg_rating * 10) / 10, open_followups: openFollowups }
}

function alertsOf({ occupancy, cleaning, laundry, complaints }) {
  const alerts = []
  if (occupancy.available && occupancy.coverage !== null && occupancy.coverage < THRESHOLDS.coverageLow) {
    alerts.push({ code: 'occupancy_coverage_low', text: `Doluluk bilgisi odaların yalnız %${occupancy.coverage}'inde var — oran temsilî olmayabilir.` })
  }
  if (occupancy.stale > 0) alerts.push({ code: 'occupancy_stale', text: `${occupancy.stale} odanın doluluğu 14 gündür teyit edilmedi.` })
  if (cleaning.unmarked_rooms > 0) alerts.push({ code: 'cleaning_unmarked', text: `${cleaning.unmarked_rooms} oda için temizlik işareti yok.` })
  if (cleaning.qr_mismatches_open > 0) alerts.push({ code: 'qr_mismatch', text: `${cleaning.qr_mismatches_open} yanlış kapı etiketi kaydı açık.` })
  if (laundry.ready_late > 0) alerts.push({ code: 'laundry_ready_late', text: `${laundry.ready_late} torba ${THRESHOLDS.readyWaitHours} saatten uzun süredir hazırda bekliyor.` })
  if (laundry.open_oldest_hours !== null && laundry.open_oldest_hours >= THRESHOLDS.openBagHours) {
    alerts.push({ code: 'laundry_open_old', text: `En eski açık torba ${laundry.open_oldest_hours} saattir yıkamada.` })
  }
  if (laundry.pickup_oldest_hours !== null && laundry.pickup_oldest_hours >= THRESHOLDS.pickupWaitHours) {
    alerts.push({ code: 'pickup_waiting', text: `Sakinin çamaşır alma talebi ${laundry.pickup_oldest_hours} saattir bekliyor.` })
  }
  if (complaints.open_followups > 0) alerts.push({ code: 'complaint_open', text: `${complaints.open_followups} sakin şikayetinin takip temizliği yapılmadı.` })
  return alerts
}

function occupancyLines(o) {
  if (!o.available) return ['🏠 Doluluk: bu gün için kayıt yok.']
  const lines = []
  if (o.pct === null) lines.push(`🏠 Doluluk: henüz dolu/boş bilgisi girilmedi (${o.unknown} oda bilinmiyor).`)
  else {
    const change = o.change_1d !== null ? ` (düne göre ${signed(o.change_1d)} puan)` : ''
    lines.push(`🏠 Doluluk %${o.pct}${change} — ${o.occupied} dolu · ${o.empty} boş · ${o.unknown} bilinmiyor`)
  }
  if (o.changes.total > 0) lines.push(`   Gün içinde ${o.changes.total} değişiklik: ${o.changes.to_occupied} dolu, ${o.changes.to_empty} boş oldu${o.changes.first_entry ? `, ${o.changes.first_entry} ilk kez girildi` : ''}.`)
  if (o.unknown_blocks.length) lines.push(`   En çok bilinmeyen: ${o.unknown_blocks.map(b => `${b.block} (${b.unknown})`).join(', ')}`)
  return lines
}

function cleaningLines(c) {
  if (c.cleaned + c.skipped === 0) return [`🧹 Temizlik: saha işareti yok (beklenen ${c.expected_rooms} oda).`]
  const qr = c.qr_pct !== null ? ` · QR ile %${c.qr_pct}` : ''
  const lines = [`🧹 Temizlik: ${c.cleaned} yer temizlendi, ${c.skipped} temizlenemedi${qr}`]
  if (c.skip_reasons.length) lines.push(`   Temizlenemedi: ${c.skip_reasons.map(r => `${r.reason} ${r.count}`).join(', ')}`)
  if (c.unmarked_rooms > 0) lines.push(`   İşaretsiz oda ${c.unmarked_rooms}: ${c.unmarked_blocks.map(b => `${b.block} ${b.count}`).join(', ')}`)
  if (c.workers.length) lines.push(`   ${c.worker_count} kişi çalıştı; en çok: ${c.workers.map(w => `${w.full_name} ${w.cleaned}`).join(', ')}`)
  return lines
}

function laundryLines(l) {
  const lines = [`🧺 Çamaşır: ${l.opened} torba alındı, ${l.readied} hazırlandı, ${l.delivered} teslim edildi`]
  const wait = [`yıkamada ${l.open_bags}${l.urgent_open ? ` (${l.urgent_open} acil)` : ''}`, `hazırda ${l.ready_bags}`]
  if (l.pickup_requests_open) wait.push(`alma talebi ${l.pickup_requests_open}`)
  lines.push(`   Şu an bekleyen: ${wait.join(' · ')}`)
  return lines
}

function complaintLines(c) {
  if (c.issues === 0 && c.approved === 0) return []
  const rating = c.avg_rating !== null ? ` (ort. ${String(c.avg_rating).replace('.', ',')}★)` : ''
  return [`💬 Sakin: ${c.approved} onay, ${c.issues} şikayet${rating}`]
}

export function buildSummaryText(summary) {
  const lines = [`🌙 Akşam saha özeti — ${trDate(summary.date)}`, '']
  lines.push(...occupancyLines(summary.occupancy), '')
  lines.push(...cleaningLines(summary.cleaning), '')
  lines.push(...laundryLines(summary.laundry))
  const complaint = complaintLines(summary.complaints)
  if (complaint.length) lines.push('', ...complaint)
  if (summary.alerts.length) lines.push('', '⚠️ Dikkat:', ...summary.alerts.map(a => `• ${a.text}`))
  else lines.push('', '✅ Dikkat gerektiren bir şey yok.')
  return lines.join('\n')
}

export function eveningSummary({ date } = {}, db = getDB(), nowMs = Date.now()) {
  const day = date ?? istanbulDate()
  if (!DATE.test(String(day))) throw fail('Tarih YYYY-MM-DD olmalı', 400)
  if (day > istanbulDate()) throw fail('Gelecek bir gün için özet yok', 400)
  const summary = {
    date: day,
    generated_at: new Date(nowMs).toISOString(),
    occupancy: occupancySection(db, day),
    cleaning: cleaningSection(db, day),
    laundry: laundrySection(db, day, nowMs),
    complaints: complaintsSection(db, day),
  }
  summary.alerts = alertsOf(summary)
  summary.text = buildSummaryText(summary)
  return summary
}
