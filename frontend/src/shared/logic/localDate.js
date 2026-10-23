// Yerel takvim günü ile çalışan tarih yardımcıları.
//
// Kod boyunca `new Date().toISOString().split('T')[0]` kalıbı kullanılıyordu.
// toISOString() UTC'ye çevirir; Türkiye UTC+3 olduğu için yerel gece yarısı ile
// 03:00 arasındaki her an BİR ÖNCEKİ günü veriyordu. Vardiya/yatakhane sistemi
// gece de kullanılıyor: "bugün" dünü, hafta başı bir önceki haftayı gösteriyor,
// gece 02:00'de açılan çizelge yanlış haftaya kayıyordu.
//
// Buradaki fonksiyonlar hiç UTC'ye uğramaz — gün, ay, yıl yerel saatten okunur.

export function ymd(date) {
  const yil = date.getFullYear()
  const ay = String(date.getMonth() + 1).padStart(2, '0')
  const gun = String(date.getDate()).padStart(2, '0')
  return `${yil}-${ay}-${gun}`
}

// 'YYYY-MM-DD' metnini yerel gün başlangıcı olarak okur. Doğrudan
// `new Date('2026-08-08')` UTC gece yarısı demektir ve negatif saat diliminde
// bir gün geriye düşer.
export function toLocalDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const [yil, ay, gun] = String(value).slice(0, 10).split('-').map(Number)
  return new Date(yil, (ay || 1) - 1, gun || 1)
}

export function todayStr() {
  return ymd(new Date())
}

// 'YYYY-MM' — yerel takvim ayı. `toISOString().slice(0, 7)` ayın 1'inde
// 00:00–03:00 arası BİR ÖNCEKİ ayı veriyordu (bordro, maliyet raporu).
export function thisMonthStr(date = new Date()) {
  return ymd(date).slice(0, 7)
}

// Sunucu zaman damgası → Date. SQLite datetime('now') UTC'yi Z'siz yazar ('2026-10-22 22:30:00');
// `new Date()` böyle bir metni YEREL saat sanar (İstanbul'da 3 saat kayar). ISO (Z/ofsetli) değer
// olduğu gibi okunur. Boş ya da bozuk değer → null.
export function parseSqlUtc(value) {
  if (!value) return null
  const s = String(value).trim()
  const iso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

// UTC zaman damgasının yerel takvim günü. `ts.startsWith(bugün)` UTC gününe bakar:
// gece 00:00–03:00 arası yazılan kayıt 'bugün' sayılmıyordu.
export function utcSqlToLocalYmd(value) {
  const d = parseSqlUtc(value)
  return d ? ymd(d) : null
}

// Hafta pazartesi başlar (takvim haftası).
export function startOfWeek(date) {
  const d = toLocalDate(date)
  const gun = d.getDay()
  d.setDate(d.getDate() + (gun === 0 ? -6 : 1 - gun))
  return ymd(d)
}

export function addDays(value, n) {
  const d = toLocalDate(value)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
