// Departman bazlı vardiya/nokta özeti — çıktıların altına konan sayım şeridi.
//
// Çıktıya bakan kişi "bu bölümde hangi vardiyada kaç kişi var, nerede
// duruyorlar" sorusunu satır satır çizelgeyi tarayarak cevaplıyordu. Bu özet
// aynı veriden hesaplanır; ayrı bir kaynak yok, dolayısıyla çizelgeyle
// çelişemez.

const CALISIYOR = ['scheduled', 'worked', 'overtime']

// Nokta seçilmemiş hücreler kendi kovasında toplanır. Bir yere karıştırılırsa
// o noktanın kadrosu olduğundan kalabalık görünür.
export const DIGEST_DEFAULT_AREA = 'Konum belirtilmemiş'
export const DIGEST_DEFAULT_SHIFT = 'Vardiya belirtilmemiş'

function calisiyorMu(cell) {
  return CALISIYOR.includes(cell?.status)
}

function saatEtiketi(cell) {
  const b = cell?.start_hour
  const s = cell?.end_hour
  if (b == null || s == null) return ''
  const iki = n => String(n).padStart(2, '0')
  return `${iki(b)}-${iki(s)}`
}

// Vardiya adı yoksa saat aralığı kullanılır; ikisi de yoksa ayrı kovaya düşer.
export function shiftLabel(cell) {
  return cell?.shift_name || saatEtiketi(cell) || DIGEST_DEFAULT_SHIFT
}

function sayacaEkle(map, anahtar) {
  map.set(anahtar, (map.get(anahtar) || 0) + 1)
}

function sirala(map) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'))
}

// groups: [{ name, people: [{ days: { 'YYYY-MM-DD': cell } }] }]
// Dönen: [{ department, people, personDays, shifts:[{name,count}], areas:[{name,count}] }]
export function departmentShiftDigest(groups = [], weekDays = []) {
  return (groups || []).map(group => {
    const vardiyalar = new Map()
    const noktalar = new Map()
    let personDays = 0
    const kisiler = group.people || []

    kisiler.forEach(person => {
      weekDays.forEach(date => {
        const cell = person.days?.[date]
        if (!calisiyorMu(cell)) return
        personDays += 1
        sayacaEkle(vardiyalar, shiftLabel(cell))
        sayacaEkle(noktalar, cell.work_location_name || DIGEST_DEFAULT_AREA)
      })
    })

    return {
      department: group.name || 'Departmansız',
      people: kisiler.length,
      personDays,
      shifts: sirala(vardiyalar),
      areas: sirala(noktalar),
    }
  })
}

// Tek satırlık okunur özet: "Gündüz 12 · Akşam 8 · Gece 4"
export function digestLine(rows = [], { max = 6, sep = ' · ' } = {}) {
  if (!rows.length) return ''
  const gosterilecek = rows.slice(0, max).map(r => `${r.name} ${r.count}`)
  // Kırpma sessiz kalmaz: kaç kalem gizlendiği yazılır, yoksa çıktı tam sanılır.
  const kalan = rows.length - gosterilecek.length
  return gosterilecek.join(sep) + (kalan > 0 ? `${sep}+${kalan} diğer` : '')
}

// Gün gün vardiya sayımı — "hangi gün hangi vardiyada kaç kişi".
export function departmentDayShiftMatrix(group, weekDays = []) {
  const vardiyaAdlari = new Set()
  const gunler = weekDays.map(date => {
    const sayac = new Map();
    (group.people || []).forEach(person => {
      const cell = person.days?.[date]
      if (!calisiyorMu(cell)) return
      const ad = shiftLabel(cell)
      vardiyaAdlari.add(ad)
      sayacaEkle(sayac, ad)
    })
    return { date, counts: sayac }
  })
  const shifts = [...vardiyaAdlari].sort((a, b) => a.localeCompare(b, 'tr'))
  return {
    shifts,
    rows: shifts.map(ad => ({
      shift: ad,
      days: gunler.map(g => g.counts.get(ad) || 0),
      total: gunler.reduce((t, g) => t + (g.counts.get(ad) || 0), 0),
    })),
    dayTotals: gunler.map(g => [...g.counts.values()].reduce((t, n) => t + n, 0)),
  }
}

// GÜN GÜN DÖKÜM — "o gün hangi vardiyada kimler var, kaç kişi".
//
// Matris yalnız SAYI veriyordu; sahada "bu gece kim var" sorusunu isim isim
// cevaplamak için yine çizelgeye dönmek gerekiyordu. Burada gün → vardiya →
// (nokta) → isimler kırılımı üretilir.
//
// İsimler bölüm bilgisiyle taşınır: aynı vardiyada iki bölümden insan olabilir
// ve çıktıya bakan kişi kimin nereden olduğunu bilmek ister.
export function dayRoster(groups = [], weekDays = [], { byLocation = true } = {}) {
  return (weekDays || []).map(date => {
    const vardiyalar = new Map()

    ;(groups || []).forEach(group => (group.people || []).forEach(person => {
      const cell = person.days?.[date]
      if (!calisiyorMu(cell)) return
      const vardiya = shiftLabel(cell)
      if (!vardiyalar.has(vardiya)) vardiyalar.set(vardiya, new Map())
      const yerler = vardiyalar.get(vardiya)
      const yer = byLocation ? (cell.work_location_name || DIGEST_DEFAULT_AREA) : ''
      if (!yerler.has(yer)) yerler.set(yer, [])
      yerler.get(yer).push({
        name: person.full_name || '',
        department: group.name || person.dept_name || 'Departmansız',
        role: person.role_name || person.position || '',
      })
    }))

    const shifts = [...vardiyalar.entries()]
      .map(([shift, yerler]) => {
        const locations = [...yerler.entries()]
          .map(([location, people]) => ({
            location,
            count: people.length,
            people: people.sort((a, b) => a.name.localeCompare(b.name, 'tr')),
          }))
          .sort((a, b) => b.count - a.count || a.location.localeCompare(b.location, 'tr'))
        return {
          shift,
          count: locations.reduce((t, l) => t + l.count, 0),
          locations,
        }
      })
      .sort((a, b) => b.count - a.count || a.shift.localeCompare(b.shift, 'tr'))

    return {
      date,
      total: shifts.reduce((t, v) => t + v.count, 0),
      shifts,
    }
  })
}

// Tek satırda isim listesi; uzun listeler kırpılır ama kırpma SÖYLENİR.
export function namesLine(people = [], { max = 14 } = {}) {
  const adlar = people.map(p => p.name).filter(Boolean)
  if (!adlar.length) return ''
  const gosterilen = adlar.slice(0, max)
  const kalan = adlar.length - gosterilen.length
  return gosterilen.join(', ') + (kalan > 0 ? ` … +${kalan} kişi` : '')
}

// HAFTA ÖZETİ — bütün günler tek bakışta: vardiya satırları, gün sütunları.
//
// Gün detayı panelinde her günü tek tek açmak gerekiyordu; "perşembe gecesi
// kaç kişi var" sorusu 7 tıklama ediyordu. Bu, aynı hücrelerden haftalık
// matrisi çıkarır — ek istek yok, ekrandaki veri yeter.
export function weekShiftMatrix(groups = [], weekDays = []) {
  const herkes = (groups || []).flatMap(g => g.people || [])
  const matris = departmentDayShiftMatrix({ people: herkes }, weekDays)
  return {
    ...matris,
    // En kalabalık vardiya üstte dursun; gözün ilk gittiği yer o olsun.
    rows: [...matris.rows].sort((a, b) => b.total - a.total || a.shift.localeCompare(b.shift, 'tr')),
    weekTotal: matris.dayTotals.reduce((t, n) => t + n, 0),
  }
}

// Gün başına toplam — gün düğmelerinde rozet olarak gösterilir.
export function dayHeadcounts(groups = [], weekDays = []) {
  const roster = dayRoster(groups, weekDays, { byLocation: false })
  return Object.fromEntries(roster.map(g => [g.date, g.total]))
}
