import { getDB } from '../../shared/db/index.js'

// Faz 5 — Bordro güvenlik kapısı.
//
// Bugün banka dosyası ve kesin bordro, dönem hazır olmasa da üretilebiliyor.
// Canlıda 2026-08-10 itibarıyla önceki aylarda 1299 gün hâlâ "planlı" — o
// aylardan biri için banka dosyası çekilirse eksik/yanlış ödeme çıkar ve bu,
// geri alınması en zor hatalardan biridir.
//
// Kapı ENGELLEMEZ değil, ENGELLER: kesin çıktı ancak tüm kontroller geçince
// üretilir. Taslak çıktı her zaman alınabilir ama üzerinde TASLAK yazar.

const AYLIK = /^\d{4}-\d{2}$/

export function isIsoMonth(v) {
  return AYLIK.test(String(v || ''))
}

function ayinSonGunu(month) {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

// Sorgu patlarsa 'unknown' üretilir; kapı "geçti" demez. Ölçemediğimiz bir
// koşulu geçmiş saymak, kapının kendisini anlamsız kılar.
function sayimDene(db, sql, params) {
  try {
    const row = db.prepare(sql).get(...params)
    return row ? Number(Object.values(row)[0] ?? 0) : 0
  } catch {
    return null
  }
}

function kontrol(key, label, { count, detail, action, blockingWhenPositive = true }) {
  const status = count === null ? 'unknown'
    : (blockingWhenPositive ? count > 0 : count === 0) ? 'blocked'
    : 'ok'
  return { key, label, status, count, detail, action }
}

export function evaluatePayrollGate(month, db = getDB()) {
  if (!isIsoMonth(month)) throw Object.assign(new Error('month YYYY-MM formatında olmalı'), { statusCode: 400 })
  const ilk = `${month}-01`
  const son = ayinSonGunu(month)

  const checks = []

  // 1) Puantaj kontrolü — o ayda kapanmamış gün kalmamalı
  const kapanmamis = sayimDene(db,
    "SELECT COUNT(*) c FROM shift_schedule WHERE work_date BETWEEN ? AND ? AND status = 'scheduled'", [ilk, son])
  checks.push(kontrol('unclosed_days', 'Puantaj kontrolü', {
    count: kapanmamis,
    detail: kapanmamis === null ? 'Ölçülemedi'
      : kapanmamis === 0 ? 'Tüm günler kapatılmış'
      : `${kapanmamis} gün hâlâ "planlı" — çalışıldı/izinli olarak kapatılmamış`,
    action: { label: 'Puantajda aç', route: `/shifts?tab=puantaj&month=${month}` },
  }))

  // 2) İzin/rapor mutabakatı — o aya değen bekleyen izin talebi kalmamalı
  const izin = sayimDene(db,
    "SELECT COUNT(*) c FROM leave_requests WHERE status = 'pending' AND start_date <= ? AND end_date >= ?", [son, ilk])
  checks.push(kontrol('pending_leave', 'İzin / rapor mutabakatı', {
    count: izin,
    detail: izin === null ? 'Ölçülemedi'
      : izin === 0 ? 'Bekleyen izin talebi yok'
      : `${izin} izin talebi hâlâ onay bekliyor`,
    action: { label: 'İzin taleplerini aç', route: '/shifts?tab=leaves&status=pending' },
  }))

  // 3) Mesai mutabakatı
  const mesai = sayimDene(db,
    "SELECT COUNT(*) c FROM overtime_requests WHERE status = 'pending' AND work_date BETWEEN ? AND ?", [ilk, son])
  checks.push(kontrol('pending_overtime', 'Fazla mesai mutabakatı', {
    count: mesai,
    detail: mesai === null ? 'Ölçülemedi'
      : mesai === 0 ? 'Bekleyen mesai talebi yok'
      : `${mesai} mesai talebi hâlâ onay bekliyor`,
    action: { label: 'Mesai taleplerini aç', route: '/shifts?tab=overtime&status=pending' },
  }))

  // 4) Açık istisnalar — bekleyen vardiya takasları
  const takas = sayimDene(db,
    "SELECT COUNT(*) c FROM shift_swap_requests WHERE status = 'pending' AND swap_date BETWEEN ? AND ?", [ilk, son])
  checks.push(kontrol('pending_swap', 'Açık istisnalar (takas)', {
    count: takas,
    detail: takas === null ? 'Ölçülemedi'
      : takas === 0 ? 'Bekleyen takas yok'
      : `${takas} takas talebi hâlâ onay bekliyor`,
    action: { label: 'Takasları aç', route: '/shifts?tab=swaps&status=pending' },
  }))

  // 5) Departman onayları — o dönem için onaylanmış kayıt olmalı
  const onay = sayimDene(db,
    "SELECT COUNT(*) c FROM puantaj_period_approvals WHERE period = ? AND status = 'approved'", [month])
  checks.push(kontrol('department_approval', 'Departman onayları', {
    count: onay,
    blockingWhenPositive: false,   // burada SIFIR olması engeldir
    detail: onay === null ? 'Ölçülemedi'
      : onay > 0 ? `${onay} departman onayı alınmış`
      : 'Hiçbir departman onayı yok',
    action: { label: 'Onay ekranını aç', route: `/shifts?tab=puantaj&month=${month}&view=approvals` },
  }))

  // 6) Dönem kilidi — kesin çıktı ancak kilitli dönemden alınır
  const kilit = sayimDene(db, 'SELECT COUNT(*) c FROM period_locks WHERE period = ?', [month])
  checks.push(kontrol('period_lock', 'Dönem kilidi', {
    count: kilit,
    blockingWhenPositive: false,
    detail: kilit === null ? 'Ölçülemedi'
      : kilit > 0 ? 'Dönem kilitli'
      : 'Dönem kilitlenmemiş — kilitlenmeden kesin çıktı alınamaz',
    action: { label: 'Dönemi kilitle', route: `/shifts?tab=puantaj&month=${month}` },
  }))

  const blocking = checks.filter(c => c.status === 'blocked')
  const unknown = checks.filter(c => c.status === 'unknown')

  return {
    month,
    // Ölçülemeyen kontrol varken "hazır" demek kapıyı anlamsız kılar.
    ready: blocking.length === 0 && unknown.length === 0,
    checks,
    blocking: blocking.map(c => c.key),
    unknown: unknown.map(c => c.key),
  }
}

// Kesin çıktının kimliği: hangi dönem, kim, ne zaman ve doğrulama numarası.
// Numara dönem + zaman damgasından türetilir; iki farklı dosya aynı numarayı
// taşımasın diye üretim anını da içerir.
export function buildOutputStamp({ month, userName, kind, now = new Date() }) {
  const damga = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    + `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const ayKodu = String(month).replace('-', '')
  return {
    kind,                                    // 'draft' | 'final'
    label: kind === 'final' ? 'KESİN' : 'TASLAK',
    month,
    generated_by: userName || 'bilinmiyor',
    generated_at: now.toISOString(),
    verification_no: `${kind === 'final' ? 'K' : 'T'}-${ayKodu}-${damga}`,
  }
}
