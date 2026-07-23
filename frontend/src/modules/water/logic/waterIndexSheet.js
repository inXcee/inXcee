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
  const columns = (Array.isArray(products) ? products : []).map(product => ({
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
  return (Array.isArray(products) ? products : [])
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

// Excel çıktısı: ekrandaki INDEX düzeninin birebir satır karşılığı.
// Marka bandı ilk satırda; markanın adı kendi ilk sütununa yazılır, kalan
// sütunları boş bırakılır (ExcelJS tarafında merge edilir).
function brandBandRow(brandGroups, leadCols, columnCount) {
  const row = new Array(leadCols).fill('')
  brandGroups.forEach(group => {
    row.push(group.brand)
    for (let index = 1; index < group.span; index += 1) row.push('')
  })
  while (row.length < leadCols + columnCount) row.push('')
  row.push('') // TOPLAM sütununun bandı boş
  return row
}

export function buildIndexSheetRows({ report, products, returns }) {
  const matrix = buildIndexMatrix({ report, products })
  const intake = buildIntakeMatrix({ report, products })
  const legend = buildPaletteLegend(products)
  const groups = buildReturnGroups(returns)
  const names = matrix.columns.map(column => column.name)

  const indexRows = [
    brandBandRow(matrix.brandGroups, 2, matrix.columns.length),
    ['SIRA', 'FİRMA ADI', ...names, 'TOPLAM'],
    ...matrix.rows.map(row => [row.seq, row.zone_name, ...row.cells, row.total]),
    ['', 'TOPLAM', ...matrix.columnTotals, matrix.grandTotal],
    ['', 'GENEL TOPLAM', ...matrix.columnTotals, matrix.grandTotal],
  ]
  // Yer satırı yoksa TOPLAM/GENEL TOPLAM da anlamsız — yalnız başlıklar kalsın.
  if (!matrix.rows.length) indexRows.splice(2)

  const intakeRows = [
    brandBandRow(intake.brandGroups, 1, intake.columns.length),
    ['GÜN', ...names, 'TOPLAM'],
    ...intake.rows.map(row => [row.dayNo, ...row.cells, row.total]),
    ['TOPLAM', ...intake.columnTotals, intake.grandTotal],
  ]

  const returnRows = []
  groups.forEach(group => {
    group.rows.forEach(row => {
      returnRows.push([group.brand, row.move_date, row.product_name, row.pallets ?? '', row.qty_base])
    })
    returnRows.push([group.brand, '', 'TOPLAM', '', group.total])
  })

  return {
    index: { rows: indexRows, brandGroups: matrix.brandGroups, leadCols: 2 },
    intake: { rows: intakeRows, brandGroups: intake.brandGroups, leadCols: 1 },
    palette: {
      headers: ['MARKA', 'ÜRÜN', 'PALET İÇERİĞİ'],
      rows: legend.map(item => [item.brand || '', item.label, item.text]),
    },
    returns: {
      headers: ['MARKA', 'TARİH', 'ÜRÜN', 'PALET', 'ADET'],
      rows: returnRows,
    },
  }
}

// Boş kap iadeleri markaya göre gruplanır (Excel'de MİLA / AVRİL ayrı tablolar).
export function buildReturnGroups(returns) {
  const groups = new Map()
  for (const row of Array.isArray(returns) ? returns : []) {
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
