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

export function parseSignatureSheet(text, date) {
  const rows = []
  const errors = []
  String(text || '').split(/\r?\n/).forEach((line, i) => {
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
