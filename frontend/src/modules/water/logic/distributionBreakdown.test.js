import { describe, it, expect } from 'vitest'
import {
  ZONE_PRODUCT_COLUMNS,
  buildBreakdown,
  filterZones,
  dayLines,
  breakdownExcelRows,
  productLabel,
} from './distributionBreakdown.js'

// Rapor JSON'unun panelin kullandığı alt kümesi (backend report.js sözleşmesi).
const makeReport = () => ({
  from: '2026-07-01',
  to: '2026-07-03',
  daily: [
    { key: '2026-07-01', label: '01.07 Çar' },
    { key: '2026-07-02', label: '02.07 Per' },
    { key: '2026-07-03', label: '03.07 Cum' },
  ],
  detail: {
    grouped: false,
    columns: [
      { key: '2026-07-01', label: '01', full: '01.07.2026' },
      { key: '2026-07-02', label: '02', full: '02.07.2026' },
      { key: '2026-07-03', label: '03', full: '03.07.2026' },
    ],
    column_totals: [300, 260, 100],
    grand_total: 660,
    rows: [
      {
        zone_id: 1,
        zone_name: 'OSMANGAZİ',
        total: 500,
        share: 75.8,
        cells: [300, 200, 0],
        products: [
          { product_id: 10, name: 'Bardak Su', brand_name: 'MİLA SU', total: 400, cells: [250, 150, 0] },
          { product_id: 11, name: 'Damacana', brand_name: 'AVRİL', total: 100, cells: [50, 50, 0] },
        ],
      },
      {
        zone_id: 2,
        zone_name: 'FPU GOE',
        total: 160,
        share: 24.2,
        cells: [0, 60, 100],
        products: [
          { product_id: 10, name: 'Bardak Su', brand_name: 'MİLA SU', total: 160, cells: [0, 60, 100] },
        ],
      },
    ],
    product_rows: [
      { product_id: 10, name: 'Bardak Su', brand_name: 'MİLA SU', unit_label: 'koli', total: 560, share: 84.8, cells: [250, 210, 100] },
      { product_id: 11, name: 'Damacana', brand_name: 'AVRİL', unit_label: 'adet', total: 100, share: 15.2, cells: [50, 50, 0] },
    ],
    days: [
      {
        key: '2026-07-01',
        label: '01.07.2026',
        weekday: 'Çarşamba',
        zones: [
          {
            zone_id: 1,
            zone_name: 'OSMANGAZİ',
            total: 300,
            lines: [
              { product_id: 10, product_name: 'Bardak Su', brand_name: 'MİLA SU', qty_base: 250, qty_human: '250 koli', note: 'sabah teslim', created_by_name: 'Vardiya' },
              { product_id: 11, product_name: 'Damacana', brand_name: 'AVRİL', qty_base: 50, qty_human: '50 adet', note: null, created_by_name: null },
            ],
          },
        ],
      },
    ],
  },
})

describe('dağıtım dökümü — türetme', () => {
  it('yerler çoktan aza sıralanır, özet alanları taşınır', () => {
    const { zones, totals } = buildBreakdown(makeReport())
    expect(zones.map(zone => zone.zone_name)).toEqual(['OSMANGAZİ', 'FPU GOE'])
    expect(zones[0]).toMatchObject({ total: 500, share: 75.8, activeDays: 2 })
    expect(zones[0].topProduct).toBe('Bardak Su · MİLA SU')
    expect(totals).toMatchObject({ grandTotal: 660, zoneCount: 2, productCount: 2, dayCount: 3 })
  })

  it('yer açılımı yalnız hareketli günleri, gün toplamıyla verir', () => {
    const { zones } = buildBreakdown(makeReport())
    const osman = zones[0]
    expect(osman.days.map(day => day.label)).toEqual(['01.07 Çar', '02.07 Per']) // 03.07'de hareket yok
    expect(osman.days[0]).toMatchObject({ key: '2026-07-01', total: 300 })
    expect(osman.days[0].cells).toEqual([250, 50])
    // Gün toplamları yer toplamına eşit olmalı
    expect(osman.days.reduce((sum, day) => sum + day.total, 0)).toBe(osman.total)
  })

  it('sütun toplamları ürün toplamlarıyla tutarlı', () => {
    const { zones } = buildBreakdown(makeReport())
    const osman = zones[0]
    osman.columns.forEach((column, index) => {
      expect(osman.days.reduce((sum, day) => sum + day.cells[index], 0)).toBe(column.total)
    })
  })

  it('6 üründen fazlası Diğer sütununda toplanır', () => {
    const report = makeReport()
    const many = Array.from({ length: 9 }, (_, index) => ({
      product_id: 100 + index,
      name: `Ürün ${index + 1}`,
      brand_name: null,
      total: 90 - index * 10, // çoktan aza
      cells: [90 - index * 10, 0, 0],
    }))
    report.detail.rows[0].products = many
    report.detail.rows[0].total = many.reduce((sum, item) => sum + item.total, 0)
    report.detail.rows[0].cells = [report.detail.rows[0].total, 0, 0]

    const zone = buildBreakdown(report).zones.find(item => item.zone_id === 1)
    expect(zone.columns).toHaveLength(ZONE_PRODUCT_COLUMNS + 1)
    expect(zone.columns.at(-1).label).toBe('Diğer')
    expect(zone.hidden.map(item => item.name)).toEqual(['Ürün 7', 'Ürün 8', 'Ürün 9'])
    // Diğer sütunu gizlenenlerin toplamı
    expect(zone.columns.at(-1).total).toBe(30 + 20 + 10)
    // Satır toplamı yine yer toplamına eşit
    expect(zone.days[0].cells.reduce((sum, value) => sum + value, 0)).toBe(zone.total)
  })

  it('ürün etiketi markayı taşır, markasızda sade kalır', () => {
    expect(productLabel({ name: 'Damacana', brand_name: 'AVRİL' })).toBe('Damacana · AVRİL')
    expect(productLabel({ name: 'Damacana', brand_name: null })).toBe('Damacana')
  })

  it('arama yer adına göre büyük/küçük harf duyarsız filtreler', () => {
    const { zones } = buildBreakdown(makeReport())
    expect(filterZones(zones, 'osman').map(zone => zone.zone_name)).toEqual(['OSMANGAZİ'])
    expect(filterZones(zones, 'FPU').map(zone => zone.zone_name)).toEqual(['FPU GOE'])
    expect(filterZones(zones, '')).toHaveLength(2)
    expect(filterZones(zones, 'yok')).toHaveLength(0)
  })

  it('gün açılımı ürün satırlarını not ve kaydedenle verir', () => {
    const report = makeReport()
    const lines = dayLines(report, 1, '2026-07-01')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      label: 'Bardak Su · MİLA SU', qty_human: '250 koli', note: 'sabah teslim', created_by_name: 'Vardiya',
    })
    expect(lines[1].note).toBeNull()
    // Detay üretilmemiş gün/yer için boş dizi (62+ hareketli gün sınırı)
    expect(dayLines(report, 1, '2026-07-02')).toEqual([])
    expect(dayLines({ detail: { days: [] } }, 1, '2026-07-01')).toEqual([])
  })
})

describe('dağıtım dökümü — Excel satırları', () => {
  it('Özet sayfası: yer satırları + genel toplam', () => {
    const breakdown = buildBreakdown(makeReport())
    const { summary } = breakdownExcelRows(breakdown)
    expect(summary.headers).toEqual(['NO', 'DAĞITIM YERİ', 'Bardak Su · MİLA SU', 'Damacana · AVRİL', 'TOPLAM', 'PAY'])
    expect(summary.rows[0]).toEqual([1, 'OSMANGAZİ', 400, 100, 500, '%75,8'])
    expect(summary.rows[1]).toEqual([2, 'FPU GOE', 160, 0, 160, '%24,2'])
    expect(summary.rows.at(-1)).toEqual(['', 'GENEL TOPLAM', 560, 100, 660, '%100'])
  })

  it('Gün Detay sayfası: düz satırlar, not ve kaydeden dahil', () => {
    const breakdown = buildBreakdown(makeReport())
    const { daily } = breakdownExcelRows(breakdown, makeReport())
    expect(daily.headers).toEqual(['TARİH', 'GÜN', 'DAĞITIM YERİ', 'ÜRÜN', 'MARKA', 'MİKTAR', 'OKUNUR', 'NOT', 'KAYDEDEN'])
    expect(daily.rows[0]).toEqual([
      '2026-07-01', 'Çarşamba', 'OSMANGAZİ', 'Bardak Su', 'MİLA SU', 250, '250 koli', 'sabah teslim', 'Vardiya',
    ])
    expect(daily.rows[1]).toEqual([
      '2026-07-01', 'Çarşamba', 'OSMANGAZİ', 'Damacana', 'AVRİL', 50, '50 adet', '', '',
    ])
  })

  it('boş rapor güvenli sonuç verir', () => {
    const empty = buildBreakdown({ daily: [], detail: { columns: [], rows: [], product_rows: [], days: [], column_totals: [], grand_total: 0 } })
    expect(empty.zones).toEqual([])
    expect(empty.totals.grandTotal).toBe(0)
    const { summary, daily } = breakdownExcelRows(empty)
    expect(summary.rows).toEqual([])
    expect(daily.rows).toEqual([])
  })
})
