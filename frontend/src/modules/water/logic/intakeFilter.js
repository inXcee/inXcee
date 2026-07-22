// "Gelen irsaliyeler" panelinin arama / hızlı filtre / sıralama mantığı.
// Saf fonksiyonlar — UI'dan bağımsız test edilir.

// Türkçe güvenli normalize: 'İ'→'i', 'I'→'ı'→'i', aksanlar atılır.
export function normText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Fotoğrafları hareket id'si ve irsaliye no'suna göre indeksler (O(1) sorgu).
export function buildPhotoIndex(photos = []) {
  const movementIds = new Set()
  const waybills = new Set()
  for (const photo of photos) {
    if (photo.movement_id != null) movementIds.add(Number(photo.movement_id))
    if (photo.waybill_no) waybills.add(String(photo.waybill_no))
  }
  return { movementIds, waybills }
}

export function intakeHasPhoto(row, photo) {
  if (!photo) return false
  if (photo.movementIds?.has(Number(row.id))) return true
  return Boolean(row.waybill_no && photo.waybills?.has(String(row.waybill_no)))
}

// Hızlı filtre yüklemleri. no_photo dışındakiler fotoğraf indeksine bakmaz.
export const INTAKE_FLAGS = {
  no_waybill: row => !row.waybill_no,
  no_expiry: row => Boolean(row.expiry_tracking) && !row.expiry_date,
  no_photo: (row, photo) => !intakeHasPhoto(row, photo),
  has_remaining: row => Number(row.remaining_base || 0) > 0,
}

export const INTAKE_FLAG_LABELS = {
  no_waybill: 'İrsaliyesiz',
  no_expiry: 'SKT eksik',
  no_photo: 'Fotoğrafsız',
  has_remaining: 'Kalanı var',
}

// Ay genelinde her bayraktan kaç kayıt olduğunu sayar (çip rozetleri için).
export function intakeQualityCounts(intakes = [], photo) {
  const counts = { no_waybill: 0, no_expiry: 0, no_photo: 0, has_remaining: 0 }
  for (const row of intakes) {
    for (const key of Object.keys(counts)) {
      if (INTAKE_FLAGS[key](row, photo)) counts[key] += 1
    }
  }
  return counts
}

const cmpDateDesc = (a, b) =>
  String(b.move_date).localeCompare(String(a.move_date)) || (Number(b.id) || 0) - (Number(a.id) || 0)
const cmpDateAsc = (a, b) =>
  String(a.move_date).localeCompare(String(b.move_date)) || (Number(a.id) || 0) - (Number(b.id) || 0)

export const INTAKE_SORTS = {
  date_desc: cmpDateDesc,
  date_asc: cmpDateAsc,
  qty_desc: (a, b) => (Number(b.qty_base) || 0) - (Number(a.qty_base) || 0) || cmpDateDesc(a, b),
  remaining_desc: (a, b) => (Number(b.remaining_base) || 0) - (Number(a.remaining_base) || 0) || cmpDateDesc(a, b),
}

// Aktif hızlı filtreler AND'lenir; arama ürün/marka/irsaliye/lot/not üzerinde çalışır.
export function filterIntakes(intakes = [], { search = '', quick = [], sort = 'date_desc', photo } = {}) {
  const needle = normText(search)
  const active = (Array.isArray(quick) ? quick : [...(quick || [])]).filter(key => INTAKE_FLAGS[key])
  const filtered = intakes.filter(row => {
    if (active.some(key => !INTAKE_FLAGS[key](row, photo))) return false
    if (!needle) return true
    const hay = normText([row.product_name, row.brand_name, row.waybill_no, row.lot_no, row.note]
      .filter(Boolean).join(' '))
    return hay.includes(needle)
  })
  const comparator = INTAKE_SORTS[sort] || cmpDateDesc
  return [...filtered].sort(comparator)
}
