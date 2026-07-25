// Kampüs haritası "her şey göz önünde" türetmeleri: blok durum tablosu ve
// dikkat kuyruğu. Saf fonksiyonlar — kaynak /campus-map/summary yanıtı.

const num = value => Number(value) || 0

// Tablo satırları + kampüs geneli TOPLAM. Varsayılan sıra: doluluk %'ye göre çoktan aza.
export function buildOverviewRows(summary) {
  const blocks = Object.values(summary || {})
  const rows = blocks.map(block => ({
    block: block.block,
    total_rooms: num(block.total_rooms),
    total_beds: num(block.total_beds),
    occupied: num(block.occupied),
    occupancy_pct: num(block.occupancy_pct),
    empty_rooms: num(block.empty_rooms),
    full_rooms: num(block.full_rooms),
    open_faults: num(block.open_faults),
    quarantine: num(block.quarantine),
    maintenance: num(block.maintenance),
    cleaning_total: num(block.cleaning_total),
    cleaning_done: num(block.cleaning_done),
    // Görev üretilmemiş blokta yüzde anlamsız — "—" gösterilsin diye null.
    cleaning_pct: num(block.cleaning_total) > 0 ? num(block.cleaning_pct) : null,
  })).sort((left, right) =>
    right.occupancy_pct - left.occupancy_pct
    || String(left.block).localeCompare(String(right.block), 'tr'))

  const sum = key => rows.reduce((total, row) => total + row[key], 0)
  const totalBeds = sum('total_beds')
  const cleaningTotal = sum('cleaning_total')
  const totals = {
    total_rooms: sum('total_rooms'),
    total_beds: totalBeds,
    occupied: sum('occupied'),
    // Yatak ağırlıklı — blok yüzdelerinin düz ortalaması yanıltıcı olurdu.
    occupancy_pct: totalBeds ? Math.round((sum('occupied') / totalBeds) * 100) : 0,
    empty_rooms: sum('empty_rooms'),
    full_rooms: sum('full_rooms'),
    open_faults: sum('open_faults'),
    quarantine: sum('quarantine'),
    maintenance: sum('maintenance'),
    cleaning_total: cleaningTotal,
    cleaning_done: sum('cleaning_done'),
    cleaning_pct: cleaningTotal ? Math.round((sum('cleaning_done') / cleaningTotal) * 100) : 0,
  }
  return { rows, totals }
}

export function sortOverviewRows(rows, key, direction = 'desc') {
  const factor = direction === 'asc' ? 1 : -1
  return [...(rows || [])].sort((left, right) => {
    if (key === 'block') return String(left.block).localeCompare(String(right.block), 'tr') * factor
    const a = left[key]
    const b = right[key]
    // null (temizlik görevi yok) her zaman sona — yön ne olursa olsun.
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return (a - b) * factor || String(left.block).localeCompare(String(right.block), 'tr')
  })
}

// Şu an aksiyon bekleyenler. Önem sırası: arıza > boş yatak yok > eksik temizlik
// > karantina > bakım. Aynı türde olanlar büyüklüğe göre.
const KIND_WEIGHT = { fault: 0, full: 1, cleaning: 2, quarantine: 3, maintenance: 4 }

export function buildAttentionQueue(summary) {
  const items = []
  for (const block of Object.values(summary || {})) {
    const name = block.block
    const faults = num(block.open_faults)
    if (faults > 0) {
      items.push({ block: name, kind: 'fault', severity: faults, text: `${faults} açık arıza` })
    }
    if (num(block.total_beds) > 0 && num(block.empty_rooms) === 0 && num(block.occupancy_pct) >= 100) {
      items.push({ block: name, kind: 'full', severity: 1, text: 'boş yatak yok (%100 dolu)' })
    }
    const cleaningTotal = num(block.cleaning_total)
    const remaining = cleaningTotal - num(block.cleaning_done)
    if (cleaningTotal > 0 && remaining > 0) {
      items.push({
        block: name, kind: 'cleaning', severity: remaining,
        text: `temizlik %${num(block.cleaning_pct)} — ${remaining} görev kaldı`,
      })
    }
    if (num(block.quarantine) > 0) {
      items.push({ block: name, kind: 'quarantine', severity: num(block.quarantine), text: `${num(block.quarantine)} karantina odası` })
    }
    if (num(block.maintenance) > 0) {
      items.push({ block: name, kind: 'maintenance', severity: num(block.maintenance), text: `${num(block.maintenance)} bakımdaki oda` })
    }
  }
  return items.sort((left, right) =>
    KIND_WEIGHT[left.kind] - KIND_WEIGHT[right.kind]
    || right.severity - left.severity
    || String(left.block).localeCompare(String(right.block), 'tr'))
}
