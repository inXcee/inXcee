// İmzalı föyden yapıştırılan / elle yazılan listeyi kontrol ucunun satırlarına çevirir.
//
// Her satır bir kişi: "Ad Soyad" ya da "Ad Soyad - işaret". İşaret yoksa satır
// İMZALI sayılır (föyden yalnız imza atanlar yazılır). Tanınan işaretler:
//   imza / imzalı / ✓ / +        → signed
//   boş / imzasız / yok / -      → blank
//   off / hafta tatili           → off
//   rapor / raporlu              → report
//   yıllık                       → annual
//   izin / izinli                → leave (türü belirsiz)
//   gelmedi / devamsız           → absent
// Tanınmayan işaret satırı TAHMİN EDİLMEZ, `errors` içinde döner.

const MARKS = [
  [/^(imza|imzal[ıi]|✓|✔|\+|var)$/, 'signed'],
  [/^(bo[sş]|imzas[ıi]z|yok|-|—|–)$/, 'blank'],
  [/^(off|hafta tatili|ht)$/, 'off'],
  [/^(rapor|raporlu|r)$/, 'report'],
  [/^(y[ıi]ll[ıi]k|y[ıi]ll[ıi]k izin|yi)$/, 'annual'],
  [/^(izin|izinli|i)$/, 'leave'],
  [/^(gelmedi|devams[ıi]z|g)$/, 'absent'],
]

export const MARK_LABELS = {
  signed: 'İmzalı',
  blank: 'Boş',
  off: 'OFF',
  report: 'Rapor',
  annual: 'Yıllık',
  leave: 'İzin',
  absent: 'Gelmedi',
}

function parseMark(raw) {
  const v = String(raw || '').trim().toLocaleLowerCase('tr')
  for (const [re, mark] of MARKS) if (re.test(v)) return mark
  return null
}

// "Ad Soyad - rapor", "Ad Soyad; rapor", "Ad Soyad<TAB>rapor", "Ad Soyad: rapor"
const SEP = /\s*(?:\t|;|:|\s[-–—]\s|\|)\s*/

// Haftalık ızgara: Excel'den kopyalanan "Ad Soyad ⇥ Pzt ⇥ Sal ⇥ …" satırı.
// En az üç gün sütunu varsa satır ızgaradır ("Ad ⇥ rapor ⇥ not" tek günlük biçimle
// karışmasın); hücreler sırayla weekDays'e eşlenir.
// Boş hücre = imza yok (föyde o kutu boş). Gün başlığı satırı atlanır.
const DAY_HEADER = /^(pzt|pazartesi|sal[ıi]?|[çc]ar[şs]?|[çc]ar[şs]amba|per|per[şs]embe|cum|cuma|cmt|cumartesi|paz|pazar|\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?|\d{4}-\d{2}-\d{2})$/

function isHeaderCells(cells) {
  const filled = cells.map(c => c.trim().toLocaleLowerCase('tr')).filter(Boolean)
  return filled.length >= 2 && filled.filter(c => DAY_HEADER.test(c)).length >= filled.length - 1
}

function parseGridLine(cells, lineNo, line, weekDays, rows, errors) {
  const name = cells[0].replace(/^\s*\d+[.)]\s*/, '').trim()
  if (!name || name.length < 2) {
    errors.push({ line: lineNo, text: line, reason: 'isim yok' })
    return
  }
  const dayCells = cells.slice(1)
  // Excel satır sonundaki boş sütunlar gün sayısını aşabilir — yalnız dolu fazlalık hatadır.
  while (dayCells.length > weekDays.length && !dayCells[dayCells.length - 1].trim()) dayCells.pop()
  if (dayCells.length > weekDays.length) {
    errors.push({ line: lineNo, text: line, reason: `${dayCells.length} gün sütunu var, hafta ${weekDays.length} gün` })
    return
  }
  const parsed = []
  for (const [j, raw] of dayCells.entries()) {
    const mark = raw.trim() ? parseMark(raw) : 'blank'
    if (!mark) {
      errors.push({ line: lineNo, text: line, reason: `${j + 1}. gün işareti anlaşılmadı: "${raw.trim()}"` })
      return
    }
    parsed.push({ name, date: weekDays[j], mark })
  }
  rows.push(...parsed)
}

export function parseSignatureSheet(text, date, weekDays = []) {
  const rows = []
  const errors = []
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const cells = line.split('\t')
    if (cells.length >= 4 && weekDays.length) {
      if (isHeaderCells(cells)) return
      parseGridLine(cells, i + 1, line, weekDays, rows, errors)
      return
    }
    const clean = line.replace(/^\s*\d+[.)]\s*/, '').trim()   // "1. Ad Soyad" numarası
    if (!clean) return
    const parts = clean.split(SEP).filter(Boolean)
    const name = parts[0]?.trim()
    if (!name || name.length < 2) {
      errors.push({ line: i + 1, text: line, reason: 'isim yok' })
      return
    }
    let mark = 'signed'
    let note
    if (parts.length > 1) {
      mark = parseMark(parts[1])
      if (!mark) {
        errors.push({ line: i + 1, text: line, reason: `işaret anlaşılmadı: "${parts[1]}"` })
        return
      }
      if (parts.length > 2) note = parts.slice(2).join(' ').slice(0, 300)
    }
    rows.push({ name, date, mark, ...(note ? { note } : {}) })
  })
  return { rows, errors }
}
