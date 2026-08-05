// İmza listelerindeki isimleri mevcut personel kayıtlarıyla eşleştirir.
//
// Canlı veride 179 isimden 15'i birebir tutmadı: 10'u yazım farkıydı
// (ÇOLBAN/ÇORBAN, KINICI/KINACI, MUHAMMET/MUHAMMED…), 5'i gerçekten yeni kişi,
// 1 tanesi ise gevşek bir benzerlik ölçütüyle YANLIŞ eşleşiyordu
// (SİNEM KAÇAR ↔ EMİNE ACAR — farklı insanlar). Bu yüzden yakın eşleşmeler
// otomatik bağlanmaz, yalnızca öneri olarak sunulur.

// Türkçe'ye özel: 'İ' ve 'ı' Unicode'da büyük/küçük dönüşümünde tuzaklıdır ve
// noktasız 'ı' NFD ile ayrışmaz — açıkça eşlenmeleri gerekir.
const TR_MAP = { 'İ': 'I', 'I': 'I', 'ı': 'I', 'i': 'I', 'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G', 'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C', 'Â': 'A', 'â': 'A' }

export function normalizeName(value) {
  const raw = String(value ?? '')
  let out = ''
  for (const ch of raw) out += TR_MAP[ch] ?? ch
  return out
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

// 0..1 — düzenleme mesafesinin uzunluğa oranı. difflib'in blok tabanlı oranı
// alakasız isimleri 0.75+ veriyordu; bu ölçüt onları ayırt ediyor.
export function similarity(a, b) {
  const x = normalizeName(a)
  const y = normalizeName(b)
  if (!x && !y) return 1
  const uzunluk = Math.max(x.length, y.length)
  if (!uzunluk) return 0
  return 1 - levenshtein(x, y) / uzunluk
}

// Bu eşiğin altındaki benzerlikler öneri bile sayılmaz — yanlış öneri,
// öneri olmamasından daha zararlı çünkü onaylanıp yanlış kişiye bağlanabilir.
export const NEAR_THRESHOLD = 0.85

export function matchRoster(names, staff) {
  const byNorm = new Map()
  staff.forEach(person => {
    const key = normalizeName(person.full_name)
    if (key && !byNorm.has(key)) byNorm.set(key, person)
  })

  const exact = []
  const nearAdaylari = []
  const unknown = []
  const gorulen = new Set()

  names.forEach(rawName => {
    const name = String(rawName ?? '').replace(/\s+/g, ' ').trim()
    const key = normalizeName(name)
    if (!key || gorulen.has(key)) return
    gorulen.add(key)

    const tam = byNorm.get(key)
    if (tam) {
      exact.push({ name, staff_id: tam.id, staff_name: tam.full_name, is_active: tam.is_active ?? 1 })
      return
    }

    let enIyi = null
    for (const [, person] of byNorm) {
      const score = similarity(key, person.full_name)
      if (score >= NEAR_THRESHOLD && (!enIyi || score > enIyi.score)) {
        enIyi = { name, staff_id: person.id, staff_name: person.full_name, score, is_active: person.is_active ?? 1 }
      }
    }
    if (enIyi) nearAdaylari.push(enIyi)
    else unknown.push(name)
  })

  // Bir personel kaydı yalnız bir isme önerilebilir; en yüksek skor kazanır,
  // diğerleri yeni kişi olarak kalır. Aksi halde tek kişi iki isme bağlanabilirdi.
  const near = []
  const kullanilan = new Set()
  nearAdaylari.sort((a, b) => b.score - a.score).forEach(aday => {
    if (kullanilan.has(aday.staff_id)) { unknown.push(aday.name); return }
    kullanilan.add(aday.staff_id)
    near.push(aday)
  })

  return { exact, near, unknown }
}
