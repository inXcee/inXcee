// Marka ve beden seçenekleri — renk paletiyle aynı mantık: operatör yazmak
// yerine dokunarak seçsin. Saf fonksiyonlar, DOM/ağ yok.

// Harf bedenleri ve pantolon/sayısal bedenler ayrı gruplar hâlinde gösterilir;
// tek uzun liste yerine iki satır olunca hedefleme kolaylaşıyor.
export const SIZE_LETTERS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL']
export const SIZE_NUMBERS = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56']

export const SIZE_GROUPS = [
  { key: 'letter', label: 'Harf', options: SIZE_LETTERS },
  { key: 'number', label: 'Sayı', options: SIZE_NUMBERS },
]

// İlk günden boş palet olmasın diye sahada en sık görülen markalar. Arşivden
// gelen gerçek markalar bunların ÖNÜNE eklenir — liste kullanıldıkça kendi
// verimize göre şekillenir.
export const COMMON_BRANDS = [
  'LC Waikiki', 'Koton', 'DeFacto', 'Mavi', "Colin's",
  'Kiğılı', 'Damat', 'Altınyıldız', 'US Polo', 'Lacoste',
  'Nike', 'Adidas', 'Puma', 'Zara', 'H&M',
]

const normalizeBrand = value => String(value || '').trim()
const brandKey = value => normalizeBrand(value).toLocaleLowerCase('tr').replaceAll('ı', 'i')

// Arşivde geçenler önce (kullanım sıklığına göre backend'den sıralı gelir),
// sonra kalan yaygın markalar. Aynı marka iki kez görünmez; büyük/küçük harf
// ve Türkçe İ/ı farkı tekrar saymaz.
export function brandOptions(archiveBrands = [], { limit = 18 } = {}) {
  const seen = new Set()
  const result = []
  for (const brand of [...archiveBrands, ...COMMON_BRANDS]) {
    const name = normalizeBrand(brand)
    if (!name) continue
    const key = brandKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(name)
    if (result.length >= limit) break
  }
  return result
}

// Serbest yazılan beden listede yoksa palete geçici olarak eklenir ki
// seçili görünsün (ör. "104 cm" çocuk bedeni).
export function sizeGroupsWith(current) {
  const value = String(current || '').trim()
  if (!value) return SIZE_GROUPS
  const known = SIZE_GROUPS.some(group => group.options.includes(value))
  if (known) return SIZE_GROUPS
  return [...SIZE_GROUPS, { key: 'custom', label: 'Girilen', options: [value] }]
}
