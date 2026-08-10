import { getDB } from '../../shared/db/index.js'

// Faz 3 — Aksiyon Merkezi.
//
// Bugün aynı sorunlar farklı ekranlara dağılmış durumda: onay bekleyen izin
// puantajda, açık vardiya çizelgede, süresi dolan belge personel dosyasında,
// devamsız gün detayında. Kimse hepsini birden görmüyor, dolayısıyla en
// acilinin hangisi olduğu da bilinmiyor.
//
// Buradaki kurallar:
//  - GEÇMİŞ ile GELECEK ayrılır. Gelecek tarihli plan eksiği "kritik" değildir;
//    "1000 kritik eksik" gibi sayılar tam da bu ayrım yapılmadığı için çıkıyor.
//  - Ölçülemeyen kaynak SESSİZCE 0 katkı vermez; 'unavailable' olarak bildirilir
//    ("sorun yok" ile "bakamadım" aynı şey değil).
//  - Her kaydın bir düzeltme yolu (action.route) vardır.

const ONEM = { critical: 0, warning: 1, info: 2 }

// Kaynak patlarsa (tablo yok, kolon değişmiş) sessiz kalmasın.
function guvenliSorgu(db, sql, params, kaynak, sorunlar) {
  try {
    return db.prepare(sql).all(...params)
  } catch (err) {
    sorunlar.push({ source: kaynak, error: err.message })
    return null
  }
}

function bugun() {
  const d = new Date()
  const ay = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${ay}-${String(d.getDate()).padStart(2, '0')}`
}

export function isIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))
}

// Geçmiş gün gecikmiş sayılır; bugün "bugün hallet"; gelecek yalnız bilgi.
export function zamanDilimi(date, referans = bugun()) {
  if (!isIsoDate(date)) return 'unknown'
  if (date < referans) return 'overdue'
  if (date === referans) return 'today'
  return 'future'
}

// Gecikmiş sorun kritiktir; gelecek tarihli aynı sorun yalnız bilgidir.
export function onemDerecesi(dilim, tabanOnem = 'warning') {
  if (dilim === 'overdue') return 'critical'
  if (dilim === 'today') return tabanOnem
  if (dilim === 'future') return 'info'
  return tabanOnem
}

export function buildActionCenter({ from, to } = {}, db = getDB()) {
  const referans = bugun()
  const baslangic = isIsoDate(from) ? from : referans
  const bitis = isIsoDate(to) ? to : referans
  if (baslangic > bitis) {
    throw Object.assign(new Error('Başlangıç bitişten sonra olamaz'), { statusCode: 400 })
  }

  const sorunlar = []
  const kayitlar = []

  const ekle = (kayit) => kayitlar.push(kayit)

  // ── Onay bekleyen talepler ────────────────────────────────────────────────
  const izinler = guvenliSorgu(db, `
    SELECT l.id, l.staff_id, l.start_date, l.end_date, l.leave_type, s.full_name
    FROM leave_requests l LEFT JOIN staff s ON s.id = l.staff_id
    WHERE l.status = 'pending'
    ORDER BY l.start_date LIMIT 200
  `, [], 'leave_requests', sorunlar)
  izinler?.forEach(r => {
    const dilim = zamanDilimi(r.start_date, referans)
    ekle({
      kind: 'pending_leave',
      key: `pending_leave:${r.id}`,
      severity: onemDerecesi(dilim, 'warning'),
      timeframe: dilim,
      date: r.start_date,
      staff_id: r.staff_id,
      staff_name: r.full_name || `#${r.staff_id}`,
      title: 'Onay bekleyen izin',
      detail: `${r.start_date} → ${r.end_date}${r.leave_type ? ` · ${r.leave_type}` : ''}`,
      action: { label: 'İzin talebini aç', route: '/shifts?tab=leaves&status=pending' },
    })
  })

  const mesailer = guvenliSorgu(db, `
    SELECT o.id, o.staff_id, o.work_date, o.requested_hours, s.full_name
    FROM overtime_requests o LEFT JOIN staff s ON s.id = o.staff_id
    WHERE o.status = 'pending'
    ORDER BY o.work_date LIMIT 200
  `, [], 'overtime_requests', sorunlar)
  mesailer?.forEach(r => {
    const dilim = zamanDilimi(r.work_date, referans)
    ekle({
      kind: 'pending_overtime',
      key: `pending_overtime:${r.id}`,
      severity: onemDerecesi(dilim, 'warning'),
      timeframe: dilim,
      date: r.work_date,
      staff_id: r.staff_id,
      staff_name: r.full_name || `#${r.staff_id}`,
      title: 'Onay bekleyen fazla mesai',
      detail: `${r.work_date}${r.requested_hours ? ` · ${r.requested_hours} saat` : ''}`,
      action: { label: 'Mesai talebini aç', route: '/shifts?tab=overtime&status=pending' },
    })
  })

  const takaslar = guvenliSorgu(db, `
    SELECT w.id, w.requester_id, w.swap_date, s.full_name
    FROM shift_swap_requests w LEFT JOIN staff s ON s.id = w.requester_id
    WHERE w.status = 'pending'
    ORDER BY w.swap_date LIMIT 200
  `, [], 'shift_swap_requests', sorunlar)
  takaslar?.forEach(r => {
    const dilim = zamanDilimi(r.swap_date, referans)
    ekle({
      kind: 'pending_swap',
      key: `pending_swap:${r.id}`,
      severity: onemDerecesi(dilim, 'warning'),
      timeframe: dilim,
      date: r.swap_date,
      staff_id: r.requester_id,
      staff_name: r.full_name || `#${r.requester_id}`,
      title: 'Onay bekleyen vardiya takası',
      detail: r.swap_date,
      action: { label: 'Takas talebini aç', route: '/shifts?tab=swaps&status=pending' },
    })
  })

  // ── İzin / vardiya çakışması ──────────────────────────────────────────────
  // Onaylı izni varken aynı güne vardiya yazılmış: personel geleceğini sanmıyor.
  const cakismalar = guvenliSorgu(db, `
    SELECT ss.staff_id, ss.work_date, s.full_name
    FROM shift_schedule ss
    JOIN leave_requests l ON l.staff_id = ss.staff_id AND l.status = 'approved'
      AND ss.work_date BETWEEN l.start_date AND l.end_date
    LEFT JOIN staff s ON s.id = ss.staff_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND (ss.status IS NULL OR ss.status NOT IN ('on_leave', 'off'))
    LIMIT 200
  `, [baslangic, bitis], 'leave_conflict', sorunlar)
  cakismalar?.forEach(r => {
    const dilim = zamanDilimi(r.work_date, referans)
    ekle({
      kind: 'leave_conflict',
      key: `leave_conflict:${r.staff_id}:${r.work_date}`,
      severity: onemDerecesi(dilim, 'critical'),
      timeframe: dilim,
      date: r.work_date,
      staff_id: r.staff_id,
      staff_name: r.full_name || `#${r.staff_id}`,
      title: 'İzinli güne vardiya yazılmış',
      detail: `${r.work_date} · onaylı izin varken vardiya atanmış`,
      action: { label: 'Çizelgede aç', route: `/shifts?tab=schedule&week=${r.work_date}` },
    })
  })

  // ── Vardiya tanımı olmayan kayıt ──────────────────────────────────────────
  const tanimsiz = guvenliSorgu(db, `
    SELECT ss.staff_id, ss.work_date, s.full_name
    FROM shift_schedule ss LEFT JOIN staff s ON s.id = ss.staff_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND ss.shift_def_id IS NULL
      AND (ss.status IS NULL OR ss.status IN ('scheduled', 'worked'))
    LIMIT 200
  `, [baslangic, bitis], 'missing_shift_def', sorunlar)
  tanimsiz?.forEach(r => {
    const dilim = zamanDilimi(r.work_date, referans)
    ekle({
      kind: 'missing_shift_def',
      key: `missing_shift_def:${r.staff_id}:${r.work_date}`,
      severity: onemDerecesi(dilim, 'warning'),
      timeframe: dilim,
      date: r.work_date,
      staff_id: r.staff_id,
      staff_name: r.full_name || `#${r.staff_id}`,
      title: 'Vardiya tanımı yok',
      detail: `${r.work_date} · çalışıyor görünüyor ama hangi vardiyada belli değil`,
      action: { label: 'Çizelgede aç', route: `/shifts?tab=schedule&week=${r.work_date}` },
    })
  })

  // ── İşten çıkana yazılmış gelecek vardiya ─────────────────────────────────
  const ayrilanlar = guvenliSorgu(db, `
    SELECT ss.staff_id, ss.work_date, s.full_name, s.exit_date
    FROM shift_schedule ss JOIN staff s ON s.id = ss.staff_id
    WHERE s.is_active = 0 AND ss.work_date >= ?
    LIMIT 200
  `, [referans], 'exited_future_shift', sorunlar)
  ayrilanlar?.forEach(r => {
    ekle({
      kind: 'exited_future_shift',
      key: `exited_future_shift:${r.staff_id}:${r.work_date}`,
      // Bu gelecek tarihli olsa da kritiktir: sahada olmayacak birine güveniliyor.
      severity: 'critical',
      timeframe: zamanDilimi(r.work_date, referans),
      date: r.work_date,
      staff_id: r.staff_id,
      staff_name: r.full_name || `#${r.staff_id}`,
      title: 'Ayrılan personele vardiya yazılmış',
      detail: `${r.work_date}${r.exit_date ? ` · çıkış: ${r.exit_date}` : ''}`,
      action: { label: 'Çizelgede aç', route: `/shifts?tab=schedule&week=${r.work_date}` },
    })
  })

  // ── Kapanmamış puantaj (AY BAZINDA) ───────────────────────────────────────
  //
  // Puantaj ekranı yalnız SEÇİLİ aya bakıyor; önceki aylardan devreden
  // kapanmamış günler hiçbir yerde görünmüyordu. Canlıda 2026-08-10 itibarıyla
  // önceki aylarda 1299 gün hâlâ 'scheduled' — kimse farkında değil.
  //
  // Satır satır listelenmez: 1299 kayıt aksiyon listesini boğar ve asıl acil
  // işleri görünmez kılar. Ay başına tek satır, kişi sayısıyla birlikte.
  const kapanmamis = guvenliSorgu(db, `
    SELECT substr(work_date, 1, 7) AS ay,
           COUNT(*) AS gun_sayisi,
           COUNT(DISTINCT staff_id) AS kisi_sayisi,
           MAX(work_date) AS son_gun
    FROM shift_schedule
    WHERE work_date < ? AND status = 'scheduled'
    GROUP BY ay
    ORDER BY ay DESC
    LIMIT 24
  `, [referans], 'unclosed_timesheet', sorunlar)
  kapanmamis?.forEach(r => {
    // Geçmişte kalmış her ay gecikmiştir; bu ayınki de bugünden önceki günler.
    ekle({
      kind: 'unclosed_timesheet',
      key: `unclosed_timesheet:${r.ay}`,
      severity: 'critical',
      timeframe: 'overdue',
      date: r.son_gun,
      staff_id: null,
      staff_name: `${r.kisi_sayisi} personel`,
      title: 'Kapanmamış puantaj günü',
      detail: `${r.ay} · ${r.gun_sayisi} gün hâlâ "planlı" — çalışıldı/izinli olarak kapatılmamış`,
      action: { label: 'Puantajda aç', route: `/shifts?tab=puantaj&month=${r.ay}` },
    })
  })

  // ── Süresi dolmuş belge ───────────────────────────────────────────────────
  const belgeler = guvenliSorgu(db, `
    SELECT d.staff_id, MIN(d.expires_on) AS expires_on, s.full_name
    FROM documents d JOIN staff s ON s.id = d.staff_id
    WHERE s.is_active = 1 AND d.archived_at IS NULL
      AND d.expires_on IS NOT NULL AND d.expires_on < ?
    GROUP BY d.staff_id LIMIT 200
  `, [referans], 'expired_documents', sorunlar)
  belgeler?.forEach(r => {
    ekle({
      kind: 'expired_document',
      key: `expired_document:${r.staff_id}`,
      severity: 'warning',
      timeframe: 'overdue',
      date: r.expires_on,
      staff_id: r.staff_id,
      staff_name: r.full_name || `#${r.staff_id}`,
      title: 'Süresi dolmuş belge',
      detail: `En eski süre bitişi: ${r.expires_on}`,
      action: { label: 'Personel dosyasını aç', route: `/personnel/${r.staff_id}` },
    })
  })

  kayitlar.sort((a, b) => (ONEM[a.severity] - ONEM[b.severity]) || String(a.date).localeCompare(String(b.date)))

  return {
    range: { from: baslangic, to: bitis, today: referans },
    items: kayitlar,
    summary: actionSummary(kayitlar),
    // Ölçülemeyen kaynaklar açıkça bildirilir; boş liste "sorun yok" sanılmasın.
    unavailable: sorunlar,
  }
}

export function actionSummary(items = []) {
  const say = (alan, deger) => items.filter(i => i[alan] === deger).length
  return {
    total: items.length,
    critical: say('severity', 'critical'),
    warning: say('severity', 'warning'),
    info: say('severity', 'info'),
    overdue: say('timeframe', 'overdue'),
    today: say('timeframe', 'today'),
    future: say('timeframe', 'future'),
  }
}
