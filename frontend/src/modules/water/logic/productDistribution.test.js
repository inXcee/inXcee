import { describe, it, expect } from 'vitest'
import {
  buildProductMatrix, buildHighlights, buildProductSheets, filterZones, MATRIX_ZONE_COLUMNS,
} from './productDistribution.js'

const REPORT = {
  product: { id: 7, name: '0.33 L Şişe Su', brand_name: 'Mila' },
  from: '2026-07-18',
  to: '2026-07-20',
  totals: { total_base: 432, day_count: 2, zone_count: 3, daily_avg_base: 216, first_date: '2026-07-18', last_date: '2026-07-20' },
  days: [
    {
      date: '2026-07-20',
      total_base: 300,
      total_human: '25 koli',
      zones: [
        { zone_id: 1, zone_name: 'Yemekhane', qty_base: 240, qty_human: '20 koli', record_count: 2 },
        { zone_id: 2, zone_name: 'Şantiye Ofis', qty_base: 60, qty_human: '5 koli', record_count: 1 },
      ],
    },
    {
      date: '2026-07-18',
      total_base: 132,
      total_human: '11 koli',
      zones: [
        { zone_id: 1, zone_name: 'Yemekhane', qty_base: 120, qty_human: '10 koli', record_count: 1 },
        { zone_id: 3, zone_name: 'Revir', qty_base: 12, qty_human: '1 koli', record_count: 1 },
      ],
    },
  ],
  zones: [
    { zone_id: 1, zone_name: 'Yemekhane', total_base: 360, share_pct: 83.3, day_count: 2, last_date: '2026-07-20', days: [] },
    { zone_id: 2, zone_name: 'Şantiye Ofis', total_base: 60, share_pct: 13.9, day_count: 1, last_date: '2026-07-20', days: [] },
    { zone_id: 3, zone_name: 'Revir', total_base: 12, share_pct: 2.8, day_count: 1, last_date: '2026-07-18', days: [] },
  ],
}

describe('buildProductMatrix', () => {
  it('gün satır, yer sütun matrisi kurar', () => {
    const matrix = buildProductMatrix(REPORT)
    expect(matrix.columns.map(column => column.zone_name)).toEqual(['Yemekhane', 'Şantiye Ofis', 'Revir'])
    expect(matrix.rows.map(row => row.date)).toEqual(['2026-07-20', '2026-07-18'])
    expect(matrix.rows[0].cells).toEqual([240, 60, 0])
    expect(matrix.rows[1].cells).toEqual([120, 0, 12])
    expect(matrix.hiddenCount).toBe(0)
  })

  it('sütun sınırını aşan yerleri "Diğer" sütununda toplar', () => {
    const zones = Array.from({ length: MATRIX_ZONE_COLUMNS + 3 }, (_, index) => ({
      zone_id: index + 1, zone_name: `Yer ${index + 1}`, total_base: 100 - index, days: [],
    }))
    const report = {
      zones,
      days: [{
        date: '2026-07-20',
        total_base: zones.reduce((sum, zone) => sum + zone.total_base, 0),
        zones: zones.map(zone => ({ zone_id: zone.zone_id, zone_name: zone.zone_name, qty_base: zone.total_base })),
      }],
    }
    const matrix = buildProductMatrix(report)
    expect(matrix.columns).toHaveLength(MATRIX_ZONE_COLUMNS + 1)
    expect(matrix.columns.at(-1).zone_name).toBe('Diğer (3 yer)')
    expect(matrix.hiddenCount).toBe(3)
    // Gizlenen 3 yerin toplamı son sütunda
    const hiddenTotal = zones.slice(MATRIX_ZONE_COLUMNS).reduce((sum, zone) => sum + zone.total_base, 0)
    expect(matrix.rows[0].cells.at(-1)).toBe(hiddenTotal)
    // Satır toplamı bozulmamalı
    expect(matrix.rows[0].cells.reduce((sum, value) => sum + value, 0)).toBe(matrix.rows[0].total_base)
  })

  it('boş rapor çökmez', () => {
    const matrix = buildProductMatrix({})
    expect(matrix.columns).toEqual([])
    expect(matrix.rows).toEqual([])
  })

  it('yeri belirtilmemiş kayıt sütun olarak durur', () => {
    const matrix = buildProductMatrix({
      zones: [{ zone_id: null, zone_name: 'Yer belirtilmemiş', total_base: 24 }],
      days: [{ date: '2026-07-20', total_base: 24, zones: [{ zone_id: null, zone_name: 'Yer belirtilmemiş', qty_base: 24 }] }],
    })
    expect(matrix.columns[0].zone_name).toBe('Yer belirtilmemiş')
    expect(matrix.rows[0].cells).toEqual([24])
  })
})

describe('filterZones', () => {
  it('Türkçe büyük/küçük harf farkını yok sayar', () => {
    expect(filterZones(REPORT.zones, 'ŞANTİYE').map(zone => zone.zone_name)).toEqual(['Şantiye Ofis'])
    expect(filterZones(REPORT.zones, 'revir').map(zone => zone.zone_name)).toEqual(['Revir'])
  })

  it('boş arama tüm listeyi döner', () => {
    expect(filterZones(REPORT.zones, '   ')).toHaveLength(3)
  })
})

describe('buildHighlights', () => {
  it('en yoğun günü ve en çok alan yeri bulur', () => {
    const highlights = buildHighlights(REPORT)
    expect(highlights.busiestDay).toMatchObject({ date: '2026-07-20', total_base: 300 })
    expect(highlights.topZone).toMatchObject({ zone_name: 'Yemekhane', share_pct: 83.3 })
  })

  it('veri yoksa null döner', () => {
    expect(buildHighlights({})).toEqual({ busiestDay: null, topZone: null })
  })
})

describe('buildProductSheets', () => {
  it('yer özeti genel toplam satırıyla biter', () => {
    const sheets = buildProductSheets(REPORT)
    expect(sheets.title).toBe('Mila · 0.33 L Şişe Su')
    expect(sheets.summary.rows.at(-1)).toEqual(['GENEL TOPLAM', 432, 100, 2, '2026-07-20'])
  })

  it('gün detayında her yer ayrı satır, gün toplamı bir kez yazılır', () => {
    const { daily } = buildProductSheets(REPORT)
    expect(daily.rows).toHaveLength(4)
    expect(daily.rows[0]).toEqual(['2026-07-20', 'Yemekhane', 240, 2, 300])
    expect(daily.rows[1]).toEqual(['2026-07-20', 'Şantiye Ofis', 60, 1, ''])
  })

  it('matris sayfası başlıkta yerleri sütun yapar', () => {
    const { grid } = buildProductSheets(REPORT)
    expect(grid.header).toEqual(['TARİH', 'Yemekhane', 'Şantiye Ofis', 'Revir', 'GÜN TOPLAMI'])
    expect(grid.rows[0]).toEqual(['2026-07-20', 240, 60, 0, 300])
  })

  it('boş raporda çökmeden boş sayfalar üretir', () => {
    const sheets = buildProductSheets({})
    expect(sheets.summary.rows).toEqual([])
    expect(sheets.daily.rows).toEqual([])
  })
})
