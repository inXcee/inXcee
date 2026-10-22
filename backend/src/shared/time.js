const ISTANBUL_DATE_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function istanbulDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('Gecersiz tarih')
  return ISTANBUL_DATE_FORMATTER.format(date)
}

const ISTANBUL_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Istanbul',
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function istanbulOffsetMs(date) {
  const p = Object.fromEntries(ISTANBUL_PARTS.formatToParts(date).map(x => [x.type, x.value]))
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return wall - Math.floor(date.getTime() / 1000) * 1000
}

// İstanbul takvim gününün (YYYY-MM-DD) 00:00'ını SQLite UTC metnine çevirir
// ('YYYY-MM-DD HH:MM:SS'). CURRENT_TIMESTAMP / datetime('now') kolonlarını İstanbul
// gün/ay sınırıyla filtrelemek için: `created_at >= ? AND created_at < ?`.
// SQLite 'localtime' süreç saat dilimine bağlıdır (Windows'ta TZ=Europe/Istanbul'u
// tanımaz, UTC verir); bu yardımcı her ortamda aynı sonucu verir.
export function istanbulDayStartUtc(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) throw new TypeError('Gecersiz gun')
  const naive = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(naive.getTime())) throw new TypeError('Gecersiz gun')
  const utc = new Date(naive.getTime() - istanbulOffsetMs(naive))
  return utc.toISOString().slice(0, 19).replace('T', ' ') // utc-bilinçli
}

// YYYY-MM-DD gününe n gün ekler (saf takvim aritmetiği).
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10) // utc-bilinçli
}

// İstanbul gününün UTC aralığı [from, to) — "bugün teslim edilen" gibi sayımlar için.
export function istanbulDayBoundsUtc(day = istanbulDate()) {
  return { day, from: istanbulDayStartUtc(day), to: istanbulDayStartUtc(addDays(day, 1)) }
}

// UTC metin kolonunu İstanbul yerel saatine kaydıran SQLite modifier'ı ('+180 minutes').
// date(col, ?) ile İstanbul gününe göre gruplamak için ('localtime' süreç TZ'sine bağlı).
export function istanbulSqliteModifier(day = istanbulDate()) {
  const startUtc = Date.parse(istanbulDayStartUtc(day).replace(' ', 'T') + 'Z')
  const minutes = Math.round((Date.parse(`${day}T00:00:00Z`) - startUtc) / 60000)
  return `${minutes >= 0 ? '+' : ''}${minutes} minutes`
}
