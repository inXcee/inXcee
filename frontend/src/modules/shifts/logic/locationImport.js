// Excel ve pano akışlarında kullanılan ortak lokasyon normalizasyonu/eşleştirmesi.
// Yazım ve Türkçe karakter farklarını tolere eder; belirsiz eşleşmeleri sessizce seçmez.

const LOCATION_HEADER_KEYS = [
  'lokasyon',
  'lokasyon adi',
  'calisma lokasyonu',
  'calisma noktasi',
  'calisma yeri',
  'alan',
  'konum',
  'nokta',
  'saha',
  'tesis',
  'work location',
  'location',
]

export function normalizeLocationText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isLocationHeader(value) {
  const key = normalizeLocationText(value)
  return LOCATION_HEADER_KEYS.some(header => key === header || key.startsWith(`${header} `))
}

export function findLocationColumn(headerRows = [], beforeColumn = Infinity) {
  for (const row of headerRows) {
    const col = (row || []).findIndex((value, index) => index < beforeColumn && isLocationHeader(value))
    if (col >= 0) return col
  }
  return -1
}

function addCandidate(index, key, location) {
  if (!key) return
  if (!index.has(key)) index.set(key, [])
  const list = index.get(key)
  if (!list.some(item => item.id === location.id)) list.push(location)
}

export function resolveWorkLocation(value, workLocations = []) {
  const raw = String(value ?? '').trim()
  if (!raw) return { status: 'empty', location: null, raw }

  const active = workLocations.filter(location => location?.is_active !== 0)
  const numeric = raw.match(/^#?(\d+)$/)
  if (numeric) {
    const location = active.find(item => Number(item.id) === Number(numeric[1]))
    return location
      ? { status: 'matched', match: 'id', location, raw }
      : { status: 'unmatched', location: null, raw }
  }

  const nameIndex = new Map()
  const siteIndex = new Map()
  active.forEach(location => {
    const name = normalizeLocationText(location.name)
    const site = normalizeLocationText(location.site)
    addCandidate(nameIndex, name, location)
    if (site) {
      addCandidate(nameIndex, `${site} ${name}`, location)
      addCandidate(nameIndex, `${name} ${site}`, location)
      addCandidate(siteIndex, site, location)
    }
  })

  const key = normalizeLocationText(raw)
  const exact = nameIndex.get(key) || []
  if (exact.length === 1) return { status: 'matched', match: 'name', location: exact[0], raw }
  if (exact.length > 1) return { status: 'ambiguous', location: null, candidates: exact, raw }

  const bySite = siteIndex.get(key) || []
  if (bySite.length === 1) return { status: 'matched', match: 'site', location: bySite[0], raw }
  if (bySite.length > 1) return { status: 'ambiguous', location: null, candidates: bySite, raw }

  return { status: 'unmatched', location: null, raw }
}

// "1 @ İşçi Lokali" / "İşçi Lokali | 08:00-17:00" gibi hücreleri iki parçaya ayırır.
export function splitLocationDecoratedValue(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { value: raw, locationName: null }

  const timeIndex = raw.search(/\d{1,2}:\d{2}/)
  if (timeIndex > 0) {
    const locationName = raw.slice(0, timeIndex).replace(/[\s|@/–—-]+$/g, '').trim()
    if (locationName) return { value: raw.slice(timeIndex).trim(), locationName }
  }

  const separator = raw.match(/\s+(?:@|\|)\s+/)
  if (!separator || separator.index == null) return { value: raw, locationName: null }
  const left = raw.slice(0, separator.index).trim()
  const right = raw.slice(separator.index + separator[0].length).trim()
  return { value: left, locationName: right, alternateValue: right, alternateLocationName: left }
}
