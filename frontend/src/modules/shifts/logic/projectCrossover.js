// Çapraz çalışma özeti — kadrosu bir projede olup fiilen başka projede çalışanlar.
//
// Boş liste TEK BAŞINA bir cevap değildir: noktalar projeye bağlanmadıysa liste
// zaten boş gelir. Ekranın "çapraz çalışan yok" ile "henüz kurulmadı" arasını
// ayırabilmesi için durum buradan tek yerde hesaplanır.

export const CROSSOVER_STATE = {
  UNCONFIGURED: 'unconfigured',
  EMPTY: 'empty',
  HAS_ROWS: 'has_rows',
}

export function crossoverState(payload) {
  const rows = payload?.rows || []
  const unmapped = payload?.setup?.unmapped_locations || 0
  if (rows.length) return CROSSOVER_STATE.HAS_ROWS
  // Hiç satır yok VE eşlenmemiş nokta varsa, cevap "yok" değil "bilinmiyor".
  if (unmapped > 0) return CROSSOVER_STATE.UNCONFIGURED
  return CROSSOVER_STATE.EMPTY
}

// Kişi bazında toplar: aynı kişi ay içinde birkaç gün karşı sahada çalışmış
// olabilir, satır satır okumak yerine "kim, kaç gün, nerede" görünmeli.
export function summarizeCrossover(rows = []) {
  const map = new Map()
  rows.forEach(row => {
    const key = row.staff_id
    if (!map.has(key)) {
      map.set(key, {
        staffId: row.staff_id,
        name: row.full_name,
        rosterProject: row.roster_project_name,
        workedProject: row.worked_project_name,
        days: 0,
        dates: [],
        locations: new Set(),
      })
    }
    const kayit = map.get(key)
    kayit.days += 1
    kayit.dates.push(row.work_date)
    if (row.work_location_name) kayit.locations.add(row.work_location_name)
  })
  return [...map.values()]
    .map(item => ({
      ...item,
      locations: [...item.locations].sort((a, b) => a.localeCompare(b, 'tr')),
      firstDate: item.dates.slice().sort()[0],
      lastDate: item.dates.slice().sort().at(-1),
    }))
    // En çok karşı sahada geçen üstte: dikkat isteyen önce görünsün.
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'tr'))
}

// "FPU -> Kamp Alanı: 3 kişi" gibi yön bazlı kırılım.
export function crossoverDirections(rows = []) {
  const map = new Map()
  summarizeCrossover(rows).forEach(item => {
    const key = `${item.rosterProject} → ${item.workedProject}`
    if (!map.has(key)) map.set(key, { key, from: item.rosterProject, to: item.workedProject, people: 0, days: 0 })
    const yon = map.get(key)
    yon.people += 1
    yon.days += item.days
  })
  return [...map.values()].sort((a, b) => b.days - a.days || a.key.localeCompare(b.key, 'tr'))
}
