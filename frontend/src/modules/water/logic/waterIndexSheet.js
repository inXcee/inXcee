// Kullanıcının Excel "INDEX" sayfasının birebir karşılığı: marka bantlı ürün
// sütunları, dağıtım yeri satırları, aylık gelen tır matrisi, palet çevrimleri
// ve boş kap iadeleri. Saf fonksiyonlar — veri bileşenden gelir.
//
// Sütun sırası KASITLI olarak /water/products sırasıdır (queries.js PRODUCT_ORDER:
// marka sort → ürün sort). Böylece ekran ile Excel aynı düzeni gösterir ve
// hareketsiz ürünler (ör. CAM SU) sütun olarak korunur.

const sum = values => values.reduce((total, value) => total + (value || 0), 0)

const utcDate = iso => {
  const [year, month, day] = String(iso).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

// Aralıktaki gün numaraları (ayın kaçı) — gelen tır tablosu 1..31 satırlıdır.
export function monthDayNumbers(from, to) {
  if (!from || !to) return []
  const days = []
  for (let time = utcDate(from); time <= utcDate(to); time += 86400000) {
    const date = new Date(time)
    days.push({
      key: date.toISOString().slice(0, 10),
      dayNo: date.getUTCDate(),
    })
  }
  return days
}

// Ürün sütunları + marka bantları (aynı markanın ürünleri yan yana gelir).
function productColumns(products) {
  const columns = (products || []).map(product => ({
    product_id: product.id,
    name: product.name,
    brand: product.brand_name || null,
    unit_label: product.unit_label || 'adet',
  }))
  const brandGroups = []
  columns.forEach(column => {
    const last = brandGroups[brandGroups.length - 1]
    if (last && last.brand === column.brand) last.span += 1
    else brandGroups.push({ brand: column.brand || 'MARKASIZ', span: 1 })
  })
  return { columns, brandGroups }
}

export function buildIndexMatrix({ report, products }) {
  const { columns, brandGroups } = productColumns(products)
  const indexById = new Map(columns.map((column, index) => [column.product_id, index]))
  const detail = report?.detail || {}
  const daily = report?.daily || []
  const dayLabels = (detail.columns || []).map((column, index) => ({
    key: column.key,
    label: daily[index]?.label || column.full || '',
  }))
  const empty = () => new Array(columns.length).fill(0)

  const rows = (detail.rows || []).map((zone, order) => {
    const cells = empty()
    // Yerin gün×ürün hücreleri: gün detayını da burada kuruyoruz ki satır
    // tıklanınca ek istek gerekmesin.
    const dayCells = dayLabels.map(() => empty())
    ;(zone.products || []).forEach(product => {
      const columnIndex = indexById.get(product.product_id)
      if (columnIndex == null) return
      cells[columnIndex] += product.total || 0
      ;(product.cells || []).forEach((value, dayIndex) => {
        if (value) dayCells[dayIndex][columnIndex] += value
      })
    })
    const days = dayLabels
      .map((day, dayIndex) => ({
        key: day.key,
        label: day.label,
        cells: dayCells[dayIndex],
        total: sum(dayCells[dayIndex]),
      }))
      .filter(day => day.total > 0)

    return {
      seq: order + 1,
      zone_id: zone.zone_id,
      zone_name: zone.zone_name,
      cells,
      total: zone.total || 0,
      share: zone.share ?? null,
      days,
    }
  })

  const columnTotals = columns.map((_, index) => sum(rows.map(row => row.cells[index])))
  return {
    columns,
    brandGroups,
    rows,
    columnTotals,
    grandTotal: sum(columnTotals),
  }
}

// "AYLIK GELEN TIR": satır = ayın günü, sütun = aynı ürünler.
// Giriş satırları ürün ADIYLA gelir (detail.days[].intakes) — marka ayrımı
// olmadığından aynı adlı ürünlerde ilk eşleşen sütuna yazılır.
export function buildIntakeMatrix({ report, products }) {
  const { columns, brandGroups } = productColumns(products)
  const indexByName = new Map()
  columns.forEach((column, index) => {
    if (!indexByName.has(column.name)) indexByName.set(column.name, index)
  })
  const intakesByDay = new Map()
  for (const day of report?.detail?.days || []) {
    if (day.intakes?.length) intakesByDay.set(day.key, day.intakes)
  }

  const rows = monthDayNumbers(report?.from, report?.to).map(day => {
    const cells = new Array(columns.length).fill(0)
    for (const intake of intakesByDay.get(day.key) || []) {
      const index = indexByName.get(intake.product_name)
      if (index != null) cells[index] += intake.qty_base || 0
    }
    return { key: day.key, dayNo: day.dayNo, cells, total: sum(cells) }
  })

  const columnTotals = columns.map((_, index) => sum(rows.map(row => row.cells[index])))
  return { columns, brandGroups, rows, columnTotals, grandTotal: sum(columnTotals) }
}

// Palet çevrimleri: 1 palet kaç baz birim eder (Excel'deki sağ üst lejant).
export function buildPaletteLegend(products) {
  return (products || [])
    .filter(product => Number(product.cases_per_pallet) > 0)
    .map(product => {
      const perCase = Number(product.units_per_case) || 1
      const perPallet = Number(product.cases_per_pallet)
      const unit = product.unit_label || 'adet'
      return {
        product_id: product.id,
        brand: product.brand_name || null,
        label: product.name,
        text: perCase > 1
          ? `1 palet = ${perPallet} ${unit} (${perCase}'li)`
          : `1 palet = ${perPallet} ${unit}`,
      }
    })
}

// Boş kap iadeleri markaya göre gruplanır (Excel'de MİLA / AVRİL ayrı tablolar).
export function buildReturnGroups(returns) {
  const groups = new Map()
  for (const row of returns || []) {
    const brand = row.brand_name || 'MARKASIZ'
    const group = groups.get(brand) || { brand, rows: [], total: 0 }
    const perPallet = Number(row.cases_per_pallet) || 0
    group.rows.push({
      id: row.id,
      move_date: row.move_date,
      product_name: row.product_name,
      unit_label: row.unit_label || 'adet',
      qty_base: row.qty_base || 0,
      pallets: perPallet > 0 ? Math.round((row.qty_base || 0) / perPallet) : null,
    })
    group.total += row.qty_base || 0
    groups.set(brand, group)
  }
  return [...groups.values()].map(group => ({
    ...group,
    rows: group.rows.sort((left, right) => String(left.move_date).localeCompare(String(right.move_date))),
  }))
}
