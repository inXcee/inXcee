import { describe, it, expect } from 'vitest'
import {
  buildIndexMatrix,
  buildIntakeMatrix,
  buildPaletteLegend,
  buildReturnGroups,
  monthDayNumbers,
} from './waterIndexSheet.js'

// /water/products sırası = INDEX Excel sırası (marka sort → ürün sort).
const products = [
  { id: 1, name: 'Damacana', unit_label: 'adet', brand_name: 'MİLA SU', units_per_case: 1, cases_per_pallet: 36 },
  { id: 2, name: 'Bardak Su', unit_label: 'koli', brand_name: 'MİLA SU', units_per_case: 1, cases_per_pallet: 66 },
  { id: 3, name: '0,33 LT', unit_label: 'koli', brand_name: 'MİLA SU', units_per_case: 12, cases_per_pallet: 180 },
  { id: 4, name: 'Cam Su', unit_label: 'paket', brand_name: 'MİLA SU', units_per_case: 1, cases_per_pallet: 133 },
  { id: 5, name: 'Damacana', unit_label: 'adet', brand_name: 'AVRİL', units_per_case: 1, cases_per_pallet: 36 },
]

const report = {
  from: '2026-07-01',
  to: '2026-07-31',
  daily: [
    { key: '2026-07-01', label: '01.07 Çar' },
    { key: '2026-07-02', label: '02.07 Per' },
  ],
  detail: {
    columns: [
      { key: '2026-07-01', label: '01', full: '01.07.2026' },
      { key: '2026-07-02', label: '02', full: '02.07.2026' },
    ],
    column_totals: [161, 90],
    grand_total: 251,
    rows: [
      {
        zone_id: 7,
        zone_name: 'OTC KAMP ALANI',
        total: 91 + 70,
        share: 64.1,
        cells: [161, 0],
        products: [
          { product_id: 1, name: 'Damacana', brand_name: 'MİLA SU', total: 91, cells: [91, 0] },
          { product_id: 5, name: 'Damacana', brand_name: 'AVRİL', total: 70, cells: [70, 0] },
        ],
      },
      {
        zone_id: 8,
        zone_name: 'FPU GOE',
        total: 90,
        share: 35.9,
        cells: [0, 90],
        products: [
          { product_id: 2, name: 'Bardak Su', brand_name: 'MİLA SU', total: 90, cells: [0, 90] },
        ],
      },
    ],
    product_rows: [],
    days: [
      {
        key: '2026-07-01',
        label: '01.07.2026',
        weekday: 'Çarşamba',
        intakes: [
          { waybill_no: 'IRS-1', product_name: 'Damacana', qty_base: 290, qty_human: '290 adet' },
          { waybill_no: 'IRS-1', product_name: 'Bardak Su', qty_base: 7697, qty_human: '7697 koli' },
        ],
        zones: [],
      },
      {
        key: '2026-07-03',
        label: '03.07.2026',
        weekday: 'Cuma',
        intakes: [{ waybill_no: 'IRS-2', product_name: 'Damacana', qty_base: 100, qty_human: '100 adet' }],
        zones: [],
      },
    ],
  },
}

describe('INDEX matrisi', () => {
  it('sütunlar ürün listesi sırasında ve marka bantlı gelir', () => {
    const matrix = buildIndexMatrix({ report, products })
    expect(matrix.columns.map(column => column.name)).toEqual(['Damacana', 'Bardak Su', '0,33 LT', 'Cam Su', 'Damacana'])
    expect(matrix.brandGroups.map(group => [group.brand, group.span])).toEqual([['MİLA SU', 4], ['AVRİL', 1]])
  })

  it('hareketsiz ürün sütunu da kalır (Excel ile aynı — Cam Su hep 0)', () => {
    const matrix = buildIndexMatrix({ report, products })
    const camIndex = matrix.columns.findIndex(column => column.name === 'Cam Su')
    expect(matrix.columnTotals[camIndex]).toBe(0)
    expect(matrix.rows.every(row => row.cells[camIndex] === 0)).toBe(true)
  })

  it('satırlar sıra numaralı, hücreler doğru ürüne düşer', () => {
    const { rows } = buildIndexMatrix({ report, products })
    expect(rows.map(row => [row.seq, row.zone_name])).toEqual([[1, 'OTC KAMP ALANI'], [2, 'FPU GOE']])
    // OTC: MİLA Damacana 91 (sütun 0), AVRİL Damacana 70 (sütun 4)
    expect(rows[0].cells).toEqual([91, 0, 0, 0, 70])
    expect(rows[0].total).toBe(161)
    // FPU: Bardak Su 90 (sütun 1)
    expect(rows[1].cells).toEqual([0, 90, 0, 0, 0])
  })

  it('sütun toplamları ve genel toplam tutarlı', () => {
    const { rows, columnTotals, grandTotal } = buildIndexMatrix({ report, products })
    columnTotals.forEach((total, index) => {
      expect(total).toBe(rows.reduce((sum, row) => sum + row.cells[index], 0))
    })
    expect(grandTotal).toBe(251)
    expect(columnTotals.reduce((sum, value) => sum + value, 0)).toBe(grandTotal)
  })

  it('yerin gün kırılımı satırın içinde taşınır (tıklayınca açılacak)', () => {
    const { rows } = buildIndexMatrix({ report, products })
    const otc = rows[0]
    expect(otc.days).toHaveLength(1) // yalnız 01.07'de hareket var
    expect(otc.days[0]).toMatchObject({ key: '2026-07-01', label: '01.07 Çar', total: 161 })
    expect(otc.days[0].cells).toEqual([91, 0, 0, 0, 70])
  })
})

describe('AYLIK GELEN TIR matrisi', () => {
  it('ayın tüm günleri satır olur, hareketsiz gün boş kalır', () => {
    const matrix = buildIntakeMatrix({ report, products })
    expect(matrix.rows).toHaveLength(31)
    expect(matrix.rows[0]).toMatchObject({ dayNo: 1, total: 290 + 7697 })
    expect(matrix.rows[1].total).toBe(0) // 02.07'de giriş yok
    expect(matrix.rows[2].total).toBe(100) // 03.07
  })

  it('girişler ürün sütunlarına dağılır ve toplamlar tutar', () => {
    const { rows, columnTotals, grandTotal } = buildIntakeMatrix({ report, products })
    expect(rows[0].cells[0]).toBe(290) // Damacana (MİLA)
    expect(rows[0].cells[1]).toBe(7697) // Bardak Su
    expect(columnTotals[0]).toBe(390) // 290 + 100
    expect(grandTotal).toBe(290 + 7697 + 100)
    expect(columnTotals.reduce((sum, value) => sum + value, 0)).toBe(grandTotal)
  })

  it('ayın gün sayısını doğru üretir', () => {
    expect(monthDayNumbers('2026-07-01', '2026-07-31')).toHaveLength(31)
    expect(monthDayNumbers('2026-02-01', '2026-02-28')).toHaveLength(28)
  })
})

describe('palet çevrim lejantı', () => {
  it('ürün başına 1 palet içeriğini okunur verir', () => {
    const legend = buildPaletteLegend(products)
    expect(legend[0]).toMatchObject({ brand: 'MİLA SU', label: 'Damacana', text: '1 palet = 36 adet' })
    expect(legend.find(item => item.label === '0,33 LT').text).toBe('1 palet = 180 koli (12\'li)')
    expect(legend.find(item => item.label === 'Bardak Su').text).toBe('1 palet = 66 koli')
  })

  it('palet tanımı olmayan ürünü atlar', () => {
    const legend = buildPaletteLegend([{ id: 9, name: 'Tanımsız', unit_label: 'adet', cases_per_pallet: 0 }])
    expect(legend).toEqual([])
  })
})

describe('boş iade grupları', () => {
  const returns = [
    { id: 1, move_date: '2026-07-01', product_name: 'Damacana', brand_name: 'MİLA SU', qty_base: 504, unit_label: 'adet', cases_per_pallet: 36 },
    { id: 2, move_date: '2026-07-06', product_name: 'Damacana', brand_name: 'MİLA SU', qty_base: 432, unit_label: 'adet', cases_per_pallet: 36 },
    { id: 3, move_date: '2026-07-06', product_name: 'Damacana', brand_name: 'AVRİL', qty_base: 864, unit_label: 'adet', cases_per_pallet: 36 },
  ]

  it('markaya göre gruplar, palet sayısını hesaplar, toplamı verir', () => {
    const groups = buildReturnGroups(returns)
    expect(groups.map(group => group.brand)).toEqual(['MİLA SU', 'AVRİL'])
    expect(groups[0].total).toBe(936)
    expect(groups[0].rows[0]).toMatchObject({ move_date: '2026-07-01', pallets: 14, qty_base: 504 })
    expect(groups[1].total).toBe(864)
  })

  it('boş liste güvenli', () => {
    expect(buildReturnGroups([])).toEqual([])
    expect(buildReturnGroups(null)).toEqual([])
  })
})
