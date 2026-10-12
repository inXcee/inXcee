// İzin açılış bakiyesi yapıştırma ayrıştırıcısı — Excel'den kopyalanan iki sütun
// (Ad Soyad <TAB> gün) ya da elle "Ad Soyad ; 12,5" satırları. Başlık / boş satır atlanır.
export function parseOpeningLines(text) {
  const rows = [], errors = []
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    let name, num
    const parts = line.split(/\t|;/).map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2) { name = parts[0]; num = parts[parts.length - 1] }
    else {
      const m = line.match(/^(.*\S)\s+(-?\d+(?:[.,]\d+)?)$/)
      if (m) { name = m[1]; num = m[2] }
    }
    const days = num != null ? Number(String(num).replace(',', '.')) : NaN
    if (!name || !Number.isFinite(days)) {
      // İlk satır başlıksa ("Ad Soyad  Kalan İzin") sessizce atla
      if (rows.length === 0 && errors.length === 0 && !/\d/.test(line)) return
      errors.push({ line: i + 1, text: line })
      return
    }
    rows.push({ name, days })
  })
  return { rows, errors }
}
