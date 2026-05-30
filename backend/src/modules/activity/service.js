// Birleşik aktivite/hareket geçmişi — bir personelin TÜM olaylarını (fiziksel
// okutma + operasyon) tek zaman çizelgesinde toplar. Ayrı bir "events" tablosu
// TUTMAZ: mevcut verilerden TÜRETİR (avs-self-service buildWorkerFeed felsefesi),
// böylece her zaman tutarlıdır. SQLite datetime metni ('YYYY-MM-DD HH:MM:SS')
// leksikografik = kronolojik sıralanır.

const LEAVE_LABEL = {
  annual: 'Yıllık izin', sick: 'Hastalık izni', emergency: 'Acil izin',
  maternity: 'Doğum izni', paternity: 'Babalık izni', marriage: 'Evlilik izni', bereavement: 'Vefat izni',
}
const MEAL_LABEL = { breakfast: 'Kahvaltı', lunch: 'Öğle yemeği', dinner: 'Akşam yemeği', snack: 'Ara öğün' }
const ACCESS_LABEL = {
  entry: { icon: '🚪', title: 'Giriş' }, exit: { icon: '🚧', title: 'Çıkış' },
  meal: { icon: '🍽', title: 'Yemekhane okutma' }, transport: { icon: '🚌', title: 'Servis okutma' },
  generic: { icon: '⌖', title: 'Kart okutma' }, denied: { icon: '⛔', title: 'Reddedilen okutma' },
}

// types verilirse yalnız o kind'ları üret; yoksa hepsi.
function wants(types, kind) { return !types || types.length === 0 || types.includes(kind) }

export function getStaffActivity(db, staffId, { from, to, types, limit = 60 } = {}) {
  const items = []
  const cap = Math.min(limit, 200)

  // ① Fiziksel okutmalar (access_events)
  if (wants(types, 'access')) {
    db.prepare(`
      SELECT e.event_type, e.result, e.meal_type, e.photo_url, e.scanned_at AS ts, st.name AS station_name
      FROM access_events e
      LEFT JOIN scan_stations st ON st.id = e.station_id
      WHERE e.holder_type='staff' AND e.holder_id=?
      ORDER BY e.scanned_at DESC LIMIT ?
    `).all(staffId, cap).forEach(r => {
      const denied = r.result !== 'ok'
      const meta = denied ? ACCESS_LABEL.denied : (ACCESS_LABEL[r.event_type] || ACCESS_LABEL.generic)
      items.push({
        kind: 'access', icon: meta.icon, ts: r.ts,
        title: meta.title + (r.meal_type && r.result === 'ok' ? ` · ${MEAL_LABEL[r.meal_type] || r.meal_type}` : ''),
        detail: r.station_name || null,
        result: r.result, photo_url: r.photo_url || null, station: r.station_name || null,
      })
    })
  }

  // ② Yemek kayıtları (meal_logs)
  if (wants(types, 'meal')) {
    db.prepare(`
      SELECT meal_type, meal_date, method, logged_at AS ts
      FROM meal_logs WHERE staff_id=? ORDER BY logged_at DESC LIMIT ?
    `).all(staffId, cap).forEach(r => items.push({
      kind: 'meal', icon: '🍽', ts: r.ts,
      title: `${MEAL_LABEL[r.meal_type] || r.meal_type} aldı`,
      detail: r.method === 'qr' ? 'QR/kart ile' : r.method === 'bulk' ? 'toplu' : 'elle',
    }))
  }

  // ③ KKD zimmet (al + iade — tek satır iki olay üretebilir)
  if (wants(types, 'equipment')) {
    db.prepare(`
      SELECT item_type, size, serial_no, assigned_at, returned_at, condition_on_return
      FROM kkd_assignments WHERE staff_id=? ORDER BY assigned_at DESC LIMIT ?
    `).all(staffId, cap).forEach(r => {
      const label = r.item_type + (r.size ? ` (${r.size})` : '')
      items.push({ kind: 'equipment', icon: '📦', ts: r.assigned_at, title: `Zimmet aldı: ${label}`, detail: r.serial_no || null })
      if (r.returned_at) items.push({
        kind: 'equipment', icon: '↩', ts: r.returned_at, title: `İade etti: ${label}`,
        detail: r.condition_on_return || null,
      })
    })
  }

  // ④ İzin talepleri (talep + karar)
  if (wants(types, 'leave')) {
    db.prepare(`
      SELECT leave_type, status, start_date, end_date, total_days, created_at, approved_at
      FROM leave_requests WHERE staff_id=? ORDER BY created_at DESC LIMIT ?
    `).all(staffId, cap).forEach(r => {
      const label = LEAVE_LABEL[r.leave_type] || r.leave_type
      const range = `${r.start_date} → ${r.end_date} (${r.total_days}g)`
      items.push({ kind: 'leave', icon: '📝', ts: r.created_at, title: `${label} talep etti`, detail: range })
      if (r.approved_at && r.status !== 'pending') items.push({
        kind: 'leave', icon: r.status === 'approved' ? '✅' : '❌', ts: r.approved_at,
        title: `${label} ${r.status === 'approved' ? 'onaylandı' : 'reddedildi'}`, detail: range,
        result: r.status === 'approved' ? 'ok' : 'denied',
      })
    })
  }

  // ⑤ Servis atamaları (transport)
  if (wants(types, 'transport')) {
    db.prepare(`
      SELECT ra.work_date, ra.boarded, ra.created_at AS ts, r.name AS route_name
      FROM route_assignments ra LEFT JOIN routes r ON r.id = ra.route_id
      WHERE ra.staff_id=? ORDER BY ra.created_at DESC LIMIT ?
    `).all(staffId, cap).forEach(r => items.push({
      kind: 'transport', icon: '🚌', ts: r.ts,
      title: `Servise atandı${r.route_name ? `: ${r.route_name}` : ''}`,
      detail: `${r.work_date}${r.boarded ? ' · bindi' : ''}`,
    }))
  }

  // ⑥ Kiosk olayları (audit_log, detail JSON workerId) + bildirilen arıza çözümü
  if (wants(types, 'kiosk')) {
    db.prepare(`
      SELECT action, created_at AS ts
      FROM audit_log
      WHERE action LIKE 'kiosk_avs_%' AND json_extract(detail, '$.workerId') = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(staffId, cap).forEach(r => {
      const t = r.action === 'kiosk_avs_task_complete' ? 'Görev tamamladı (kiosk)'
        : r.action === 'kiosk_avs_maintenance' ? 'Arıza bildirdi (kiosk)'
        : r.action.replace('kiosk_avs_', '').replace(/_/g, ' ')
      items.push({ kind: 'kiosk', icon: '📱', ts: r.ts, title: t, detail: null })
    })
  }

  // Tarih filtresi (JS — kaynaklar farklı kolon kullanıyor) + sırala + kes
  const fromTs = from ? `${from} 00:00:00` : null
  const toTs = to ? `${to} 23:59:59` : null
  return items
    .filter(x => x.ts && (!fromTs || x.ts >= fromTs) && (!toTs || x.ts <= toTs))
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, cap)
}
