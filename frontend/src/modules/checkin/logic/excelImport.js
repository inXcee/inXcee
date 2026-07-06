// Sakin listesi Excel/CSV için saf ayrıştırıcı — UI'dan bağımsız, test edilebilir.
//
// Esnek sütun-eşlemeli format: başlık satırı anahtar kelimeyle bulunur
// (AD SOYAD / TC / FİRMA / TELEFON / MEMLEKET / GÖREV / CİNSİYET / BLOK / ODA / GİRİŞ).
// Çıktı backend /personnel/import'un beklediği kanonik satırlar:
//   { rows: [{ fullName, tcNo, passportNo, company, phone, hometown,
//              jobTitle, gender, block, roomNo, checkInDate }] }

// Başlık hücresi → alan adı. İlk eşleşen kazanır; sıra önem taşır
// (örn. "pasaport" kontrolü "no" içeren genel kalıplardan önce gelmeli).
const HEADER_PATTERNS = [
  { field: 'fullName', re: /ad[ıi]?\s*soyad|soyad|isim|personel\s*ad/ },
  { field: 'tcNo', re: /\btc\b|kimlik/ },
  { field: 'passportNo', re: /pasaport/ },
  { field: 'company', re: /firma|şirket|sirket|taşeron|taseron|müteahhit|muteahhit/ },
  { field: 'phone', re: /tel|gsm|cep/ },
  { field: 'hometown', re: /memleket|nereli/ },
  { field: 'jobTitle', re: /görev|gorev|ünvan|unvan|meslek|pozisyon/ },
  { field: 'gender', re: /cinsiyet/ },
  { field: 'block', re: /blok/ },
  { field: 'roomNo', re: /oda/ },
  { field: 'checkInDate', re: /giriş|giris/ },
]

function headerField(cell) {
  const t = String(cell ?? '').toLocaleLowerCase('tr').trim()
  if (!t) return null
  for (const { field, re } of HEADER_PATTERNS) {
    if (re.test(t)) return field
  }
  return null
}

// JS Date / tarih-benzeri metni 'YYYY-MM-DD'ye çevir (yerel takvim günü).
function toISO(v) {
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (v == null) return null
  if (v instanceof Date) return isNaN(v) ? null : fmt(v)
  const s = String(v).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // TR biçimi: 09.06.2026 / 09/06/2026
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

const str = v => {
  if (v == null) return null
  const s = (typeof v === 'number') ? String(v) : String(v).trim()
  return s || null
}

// Tam ızgarayı ayrıştır. grid: 2B dizi (her satır hücre değerleri dizisi).
export function parsePersonnelGrid(grid) {
  if (!Array.isArray(grid) || grid.length === 0) return { error: 'Boş dosya' }

  // 1) Başlık satırı: en az 1 alan eşleyen ve mutlaka fullName içeren ilk satır.
  let headerIdx = -1
  let colMap = null // field → col index
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const map = {}
    ;(grid[r] || []).forEach((cell, c) => {
      const f = headerField(cell)
      if (f && map[f] === undefined) map[f] = c
    })
    if (map.fullName !== undefined) { headerIdx = r; colMap = map; break }
  }
  if (headerIdx === -1) return { error: 'Başlık satırı bulunamadı (AD SOYAD sütunu gerekli)' }

  // 2) Veri satırları.
  const rows = []
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r]
    if (!row || row.every(v => v == null || String(v).trim() === '')) continue
    const fullName = str(row[colMap.fullName])
    if (!fullName) continue

    const get = f => (colMap[f] !== undefined ? row[colMap[f]] : null)
    let block = str(get('block'))
    let roomNo = str(get('roomNo'))
    // Ayrı blok sütunu yoksa "A-101" / "M1 205" biçimini böl.
    if (!block && roomNo) {
      const m = roomNo.match(/^([A-Za-zÇĞİÖŞÜçğıöşü]+\d?)\s*[-/ ]\s*(\w+)$/)
      if (m) { block = m[1].toLocaleUpperCase('tr'); roomNo = m[2] }
    }

    rows.push({
      fullName,
      tcNo: str(get('tcNo')),
      passportNo: str(get('passportNo')),
      company: str(get('company')),
      phone: str(get('phone')),
      hometown: str(get('hometown')),
      jobTitle: str(get('jobTitle')),
      gender: str(get('gender')),
      block,
      roomNo,
      checkInDate: toISO(get('checkInDate')),
    })
  }

  if (rows.length === 0) return { error: 'Veri satırı bulunamadı' }
  return { rows }
}
