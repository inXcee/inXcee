// Kişi adı karşılaştırma kuralları — tek kaynak (çizelge aktarımı, izin açılış bakiyesi,
// İK kadro mutabakatı, puantaj dışa aktarımı aynı kuralı kullanır).

// Büyük/küçük harf + fazla boşlukları yok say (TR locale).
export function normalizeName(s) {
  return String(s || '').toLocaleLowerCase('tr').trim().replace(/\s+/g, ' ')
}

// Aksan-katlamalı anahtar: "Melike Akca" ile "MELİKE AKÇA" aynı sayılır (mükerrer önlenir).
const FOLD_MAP = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }
export function foldName(s) {
  return normalizeName(s)
    .replace(/[çğıİiöşüâîû]/g, ch => FOLD_MAP[ch] || ch)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// TC kimlik no: 11 hane + iki kontrol hanesi (Nüfus algoritması). Geçersizse null.
export function validTc(raw) {
  const tc = String(raw || '').replace(/\D/g, '')
  if (!/^[1-9]\d{10}$/.test(tc)) return null
  const d = [...tc].map(Number)
  const odd = d[0] + d[2] + d[4] + d[6] + d[8]
  const even = d[1] + d[3] + d[5] + d[7]
  if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return null
  if (d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 !== d[10]) return null
  return tc
}
