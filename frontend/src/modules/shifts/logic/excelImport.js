// "KAMP ALANI ÇİZELGE" Excel formatı için saf ayrıştırıcı — UI'dan bağımsız, test edilebilir.
//
// Gerçek format (yatay haftalık ızgara):
//   R: AVS KAMP ALANI PERSONEL          (başlık — atlanır)
//   R: <boş> <boş> PAZARTESİ SALI ...    (gün adları)
//   R: SIRA NO | ADI SOYADI | <7 tarih>  (tarih satırı — haftayı buradan al)
//   R: <DEPARTMAN ADI>                   (departman bandı — sonraki satırlara atanır)
//   R: 1 | MELİKE AKÇA | 08:00 17:00 | ... | OFF   (personel satırı)
//
// Çıktı backend /shifts/import'un beklediği kanonik yapı:
//   { weekDates:[7 ISO], rows:[{ name, deptName, cells:[{date,startHour,endHour,status,raw}] }], unrecognized:[] }

import { findLocationColumn, splitLocationDecoratedValue } from './locationImport.js'

// ── Tek hücreyi sınıflandır ──
// Dönüş: { kind:'blank' } | { kind:'shift', startHour, endHour, status:'scheduled' }
//        | { kind:'leave', status:'on_leave'|'off', leaveType } | { kind:'unknown' }
// leaveType: 'weekly_off' (OFF) | 'sick' (RAPORLU) | 'annual' (YILLIK İZİN) | 'unpaid' (Ü.İ)
export function classifyCell(raw) {
  if (raw == null) return { kind: 'blank' }
  const decorated = splitLocationDecoratedValue(raw)
  const s = decorated.value
  if (!s || s === '-' || s === '—') return { kind: 'blank' }

  const upper = s.toLocaleUpperCase('tr')
  const noDots = upper.replace(/[.\s]/g, '')

  // İzin / tatil / rapor türleri. OFF haftalık izin statüsüdür; leave_request üretmez.
  if (upper === 'OFF') return { kind: 'leave', status: 'off', leaveType: 'weekly_off', locationName: decorated.locationName }
  if (upper.includes('RAPOR')) return { kind: 'leave', status: 'on_leave', leaveType: 'sick', locationName: decorated.locationName }
  if (upper.includes('ÜCRETSİZ') || upper.includes('UCRETSIZ') || noDots === 'Üİ' || noDots === 'UI')
    return { kind: 'leave', status: 'on_leave', leaveType: 'unpaid', locationName: decorated.locationName }
  if (upper.includes('İZİN') || upper.includes('IZIN'))
    return { kind: 'leave', status: 'on_leave', leaveType: 'annual', locationName: decorated.locationName }

  // Saat aralığı — OTC/KAMP gibi önekleri yok say, ilk "HH:MM - HH:MM" kalıbını yakala.
  const m = s.match(/(\d{1,2}):(\d{2})\s*[-–—\s]\s*(\d{1,2}):(\d{2})/)
  if (m) {
    let startHour = parseInt(m[1], 10)
    let endHour = parseInt(m[3], 10)
    // Gece yarısı bitişi: 00:00 → 24 (yalnızca başlangıç 0 değilse; gece vardiyası 00:00-08:00 korunsun)
    if (endHour === 0 && startHour !== 0) endHour = 24
    return { kind: 'shift', startHour, endHour, status: 'scheduled', locationName: decorated.locationName }
  }

  // "İşçi Lokali | OFF" gibi lokasyonun solda olduğu izin hücreleri.
  if (decorated.alternateValue) {
    const alternate = classifyCell(decorated.alternateValue)
    if (alternate.kind !== 'unknown' && alternate.kind !== 'blank') {
      return { ...alternate, locationName: decorated.alternateLocationName }
    }
  }

  return { kind: 'unknown' }
}

// JS Date / tarih-benzeri metni 'YYYY-MM-DD'ye çevir (yerel takvim günü). Değilse null.
function toISO(v) {
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (v == null) return null
  if (v instanceof Date) return isNaN(v) ? null : fmt(v)
  const s = String(v).trim()
  if (!s || /^\d{1,2}:\d{2}/.test(s)) return null // saat → tarih değil
  if (!/\d{4}/.test(s)) return null               // 4 haneli yıl yoksa tarih sayma
  const d = new Date(s)
  return isNaN(d) ? null : fmt(d)
}

// Tam ızgarayı ayrıştır. grid: 2B dizi (her satır hücre değerleri dizisi).
export function parseCampScheduleGrid(grid) {
  if (!Array.isArray(grid) || grid.length === 0) return { error: 'Boş dosya' }

  // 1) Tarih satırını bul: en az 3 tarih-benzeri hücresi olan ilk satır.
  let dateRowIdx = -1
  let dayCols = [] // [{ col, date }]
  for (let r = 0; r < grid.length; r++) {
    const cols = []
    grid[r].forEach((v, c) => { const iso = toISO(v); if (iso) cols.push({ col: c, date: iso }) })
    if (cols.length >= 3) { dateRowIdx = r; dayCols = cols.sort((a, b) => a.col - b.col); break }
  }
  if (dateRowIdx === -1) return { error: 'Tarih başlığı bulunamadı (KAMP ÇİZELGE formatı değil)' }

  const weekDates = dayCols.map(d => d.date)
  const firstDayCol = dayCols[0].col
  const headerRows = grid.slice(Math.max(0, dateRowIdx - 2), dateRowIdx + 1)
  const locationCol = findLocationColumn(headerRows, firstDayCol)

  // 2) İsim sütunu: tarih satırında "ad/isim/soyad" geçen sütun; yoksa ilk gün sütununun solu.
  let nameCol = grid[dateRowIdx].findIndex(v => {
    const t = String(v || '').toLocaleLowerCase('tr')
    return t.includes('ad') || t.includes('isim') || t.includes('soyad')
  })
  if (nameCol === -1 || nameCol >= firstDayCol) nameCol = Math.max(0, firstDayCol - 1)
  // SIRA NO sütunu (isim sütununun solu) — sayı içeriyorsa o satır kesin personel.
  const siraCol = nameCol > 0 ? nameCol - 1 : -1

  // 3) Satırları gez: departman bandı vs personel.
  const rows = []
  const unrecognized = []
  let currentDept = null

  for (let r = dateRowIdx + 1; r < grid.length; r++) {
    const row = grid[r]
    if (!row || row.every(v => v == null || String(v).trim() === '')) continue

    // Gün hücrelerini sınıflandır.
    const classified = dayCols.map(({ col, date }) => ({ date, raw: row[col], ...classifyCell(row[col]) }))
    const hasSchedulable = classified.some(c => c.kind === 'shift' || c.kind === 'leave')

    const name = String(row[nameCol] ?? '').trim()
    const siraRaw = siraCol >= 0 ? String(row[siraCol] ?? '').trim() : ''
    const isNumberedPerson = /^\d+$/.test(siraRaw)

    // SIRA NO sayı değilse VE programlanabilir hücre yoksa → departman bandı.
    // (Sıra numaralı satır, o hafta vardiyası olmasa bile personeldir — düşürülmez.)
    if (!isNumberedPerson && !hasSchedulable) {
      const title = name || siraRaw
      if (title) currentDept = title
      continue
    }

    if (!name) continue // personel satırı ama isim yok → atla

    const cells = []
    for (const c of classified) {
      if (c.kind === 'blank') continue
      if (c.kind === 'unknown') { unrecognized.push({ name, date: c.date, raw: String(c.raw ?? '') }); continue }
      cells.push({
        date: c.date,
        startHour: c.kind === 'shift' ? c.startHour : null,
        endHour: c.kind === 'shift' ? c.endHour : null,
        status: c.status,
        leaveType: c.kind === 'leave' ? c.leaveType : undefined,
        raw: String(c.raw ?? ''),
        locationName: c.locationName || (locationCol >= 0 ? String(row[locationCol] ?? '').trim() || undefined : undefined),
      })
    }
    rows.push({
      name,
      deptName: currentDept,
      locationName: locationCol >= 0 ? String(row[locationCol] ?? '').trim() || undefined : undefined,
      cells,
    })
  }

  if (rows.length === 0) return { error: 'Personel satırı bulunamadı' }
  return { weekDates, rows, unrecognized, locationColumnFound: locationCol >= 0 }
}
