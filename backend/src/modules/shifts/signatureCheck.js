import { getDB } from '../../shared/db/index.js'
import { foldName } from './import.js'

// İmzalı föy kontrolü — SALT OKUMA.
//
// Haftalık imza föyü (signaturePdf.js) ıslak imzayla dolaşıp geri geliyor.
// Fotoğrafı okuyan taraf (Hermes/Telegram ya da elle giriş) her satır için
// "imza var / boş / üstüne OFF-RAPOR-İZİN yazılmış" bilgisini gönderir; burada
// çizelgeyle karşılaştırılır ve kişi kişi ne yapılması gerektiği söylenir.
//
// Hiçbir şey yazılmaz: föydeki el yazısı not puantajı DEĞİŞTİRMEZ, yalnız
// "puantajda X, föyde Y" farkı raporlanır. Karar müdürde.
//
// Kategori sınıflaması frontend'deki classifySignatureCell ile aynıdır
// (scheduleSignatureExport.js) — föy hangi kurala göre basıldıysa o kuralla okunur.

export const SHEET_MARKS = ['signed', 'blank', 'off', 'report', 'annual', 'leave', 'absent']

const CATEGORY_LABEL = {
  working: 'çalışıyor',
  off: 'OFF',
  annual: 'yıllık izin',
  report: 'raporlu',
  other_leave: 'izinli',
  absent: 'devamsız',
  unplanned: 'planlanmamış',
}

const MARK_LABEL = {
  signed: 'imza var',
  blank: 'imza yok',
  off: 'OFF yazılmış',
  report: 'RAPOR yazılmış',
  annual: 'YILLIK İZİN yazılmış',
  leave: 'İZİN yazılmış',
  absent: 'GELMEDİ yazılmış',
}

// Föydeki not → çizelge kategorisi. "leave" (yalnız "İZİN" yazılmış) türü belirsizdir;
// yıllık/diğer izin ikisiyle de uyumlu sayılır.
const MARK_CATEGORIES = {
  off: ['off'],
  report: ['report'],
  annual: ['annual'],
  leave: ['annual', 'other_leave'],
  absent: ['absent'],
}

export function classifyScheduleCell(cell) {
  if (!cell) return 'unplanned'
  if (['scheduled', 'worked', 'overtime'].includes(cell.status)) return 'working'
  if (cell.status === 'off') return 'off'
  if (cell.status === 'absent') return 'absent'
  if (cell.status === 'on_leave') {
    if (cell.leave_type === 'annual') return 'annual'
    if (cell.leave_type === 'sick') return 'report'
    return 'other_leave'
  }
  return 'unplanned'
}

// verdict → { level, text }. level: ok | info | warn
export function judgeRow(mark, category) {
  const plan = CATEGORY_LABEL[category]
  if (mark === 'signed') {
    if (category === 'working') return { verdict: 'ok', level: 'ok', text: 'imzalı' }
    if (category === 'unplanned') {
      return { verdict: 'signed_unplanned', level: 'warn', text: 'imza var ama çizelgede o gün planı yok — vardiya girilmeli mi?' }
    }
    return { verdict: 'signed_not_working', level: 'warn', text: `imza var ama çizelgede ${plan} — mesaiye mi geldi?` }
  }
  if (mark === 'blank') {
    if (category === 'working') return { verdict: 'missing_signature', level: 'warn', text: 'çizelgede çalışıyor ama imza yok — gelmedi mi, imzayı mı unuttu?' }
    if (category === 'unplanned') return { verdict: 'ok_unplanned', level: 'info', text: 'imza yok, plan da yok' }
    return { verdict: 'ok_not_working', level: 'ok', text: plan }
  }
  const expected = MARK_CATEGORIES[mark] || []
  if (expected.includes(category)) return { verdict: 'ok_mark_matches', level: 'ok', text: plan }
  return {
    verdict: 'mark_mismatch',
    level: 'warn',
    text: `föyde ${MARK_LABEL[mark]}, çizelgede ${plan} — puantaj düzeltilmeli mi?`,
  }
}

// "DEMİR AYŞE" ile "Ayşe Demir" aynı anahtar — föylerde soyad-önce yazım yaygın.
const tokenKey = folded => folded.split(' ').filter(Boolean).sort().join(' ')

function levenshtein(a, b) {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

const similarity = (a, b) => (a && b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0)

export const SUGGEST_MIN_SCORE = 0.72

// Bulunamayan isim için en yakın personeller. YALNIZ ÖNERİ — satır eşleşmiş sayılmaz,
// kullanıcı düzeltip yeniden gönderir. Aktif personel öne alınır.
export function suggestNames(name, staffRows, limit = 3) {
  const key = foldName(name)
  if (!key) return []
  const keySorted = tokenKey(key)
  return staffRows
    .map(s => {
      const f = foldName(s.full_name)
      const score = Math.max(similarity(key, f), similarity(keySorted, tokenKey(f)))
      return { id: s.id, full_name: s.full_name, department: s.department, is_active: !!s.is_active, score }
    })
    .filter(c => c.score >= SUGGEST_MIN_SCORE)
    .sort((a, b) => (b.is_active - a.is_active) || (b.score - a.score) || a.full_name.localeCompare(b.full_name, 'tr'))
    .slice(0, limit)
    .map(c => ({ ...c, score: Math.round(c.score * 100) / 100 }))
}

function pickOne(hits, error) {
  if (hits.length === 1) return { staff: hits[0] }
  const active = hits.filter(s => s.is_active)
  if (active.length === 1) return { staff: active[0] }
  return { error, candidates: hits.map(s => ({ id: s.id, full_name: s.full_name })) }
}

function resolveStaff(row, lookup) {
  const { byId, byFold, byTokens, staffRows } = lookup
  if (row.staff_id != null) {
    const s = byId.get(Number(row.staff_id))
    return s ? { staff: s } : { error: `#${row.staff_id} personel kaydı yok` }
  }
  const key = foldName(row.name)
  if (!key) return { error: 'isim okunamadı' }
  const hits = byFold.get(key) || []
  if (hits.length) return pickOne(hits, 'aynı isimde birden fazla personel')
  // Kelime sırası farklı ama kelimeler birebir aynı — bulanık değil, kesin eşleşme.
  const swapped = byTokens.get(tokenKey(key)) || []
  if (swapped.length) {
    const r = pickOne(swapped, 'ad/soyad sırası farklı, birden fazla personel uyuyor')
    return r.staff ? { ...r, matched_by: 'word_order' } : r
  }
  return { error: 'isim personel listesinde bulunamadı', suggestions: suggestNames(row.name, staffRows) }
}

/**
 * @param {{ rows: Array<{staff_id?: number, name?: string, date: string, mark: string, note?: string}>,
 *           department_id?: number }} input
 */
export function checkSignatureSheet({ rows = [], department_id = null } = {}, db = getDB()) {
  const staffRows = db.prepare(`
    SELECT s.id, s.full_name, s.is_active, s.department_id, COALESCE(d.name, '') AS department
    FROM staff s LEFT JOIN departments d ON d.id = s.department_id
  `).all()
  const byId = new Map(staffRows.map(s => [s.id, s]))
  const byFold = new Map()
  const byTokens = new Map()
  const push = (map, k, s) => { if (!map.has(k)) map.set(k, []); map.get(k).push(s) }
  for (const s of staffRows) {
    const k = foldName(s.full_name)
    push(byFold, k, s)
    push(byTokens, tokenKey(k), s)
  }
  const lookup = { byId, byFold, byTokens, staffRows }

  const dates = [...new Set(rows.map(r => r.date))].sort()
  const cells = new Map()
  if (dates.length) {
    const marks = dates.map(() => '?').join(',')
    for (const c of db.prepare(`
      SELECT staff_id, work_date, status, leave_type FROM shift_schedule WHERE work_date IN (${marks})
    `).all(...dates)) cells.set(`${c.staff_id}|${c.work_date}`, c)
  }

  const items = []
  const unmatched = []
  const seen = new Set()
  const duplicates = []
  rows.forEach((row, index) => {
    const r = resolveStaff(row, lookup)
    if (!r.staff) {
      unmatched.push({
        index, name: row.name ?? null, staff_id: row.staff_id ?? null, date: row.date, mark: row.mark,
        reason: r.error, candidates: r.candidates || [], suggestions: r.suggestions || [],
      })
      return
    }
    const s = r.staff
    const key = `${s.id}|${row.date}`
    if (seen.has(key)) {
      duplicates.push({ index, staff_id: s.id, full_name: s.full_name, date: row.date })
      return
    }
    seen.add(key)
    const cell = cells.get(key) || null
    const category = classifyScheduleCell(cell)
    items.push({
      index,
      staff_id: s.id,
      full_name: s.full_name,
      department: s.department,
      is_active: !!s.is_active,
      ...(r.matched_by ? { matched_by: r.matched_by, sheet_name: row.name } : {}),
      date: row.date,
      mark: row.mark,
      note: row.note || null,
      planned: category,
      ...judgeRow(row.mark, category),
    })
  })

  // Föyde hiç satırı olmayan ama o gün çalışması planlanmış kişiler.
  // Bölüm verilirse yalnız o bölüm; verilmezse föyde geçen bölümler.
  const deptFilter = department_id != null
    ? new Set([Number(department_id)])
    : new Set(items.map(i => byId.get(i.staff_id)?.department_id).filter(v => v != null))
  const notOnSheet = []
  for (const [key, cell] of cells) {
    if (seen.has(key) || classifyScheduleCell(cell) !== 'working') continue
    const s = byId.get(cell.staff_id)
    if (!s || !s.is_active || !deptFilter.has(s.department_id)) continue
    notOnSheet.push({ staff_id: s.id, full_name: s.full_name, department: s.department, date: cell.work_date })
  }
  notOnSheet.sort((a, b) => a.date.localeCompare(b.date) || a.full_name.localeCompare(b.full_name, 'tr'))

  const count = (pred) => items.filter(pred).length
  return {
    dates,
    summary: {
      rows: rows.length,
      matched: items.length,
      signed_ok: count(i => i.verdict === 'ok'),
      not_working_ok: count(i => i.verdict === 'ok_not_working' || i.verdict === 'ok_mark_matches'),
      warnings: count(i => i.level === 'warn'),
      missing_signature: count(i => i.verdict === 'missing_signature'),
      mark_mismatch: count(i => i.verdict === 'mark_mismatch'),
      signed_not_working: count(i => i.verdict === 'signed_not_working' || i.verdict === 'signed_unplanned'),
      unmatched: unmatched.length,
      duplicates: duplicates.length,
      not_on_sheet: notOnSheet.length,
    },
    items,
    unmatched,
    duplicates,
    not_on_sheet: notOnSheet,
  }
}
