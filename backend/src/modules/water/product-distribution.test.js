import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = vi.hoisted(() => ({
  getProduct: vi.fn(),
  productDistributionCells: vi.fn(),
}))

vi.mock('./queries.js', () => queryMocks)

const { productDistributionService } = await import('./analytics.js')

// 0.33 L şişe: 12 şişe/koli, 84 koli/palet — humanize palet/koli kırar.
const PRODUCT = {
  id: 7,
  name: '0.33 L Şişe Su',
  brand_name: 'Mila',
  unit_label: 'şişe',
  units_per_case: 12,
  cases_per_pallet: 84,
}

const CELLS = [
  { date: '2026-07-20', zone_id: 1, zone_name: 'Yemekhane', qty_base: 240, record_count: 2 },
  { date: '2026-07-20', zone_id: 2, zone_name: 'Şantiye Ofis', qty_base: 60, record_count: 1 },
  { date: '2026-07-18', zone_id: 1, zone_name: 'Yemekhane', qty_base: 120, record_count: 1 },
  { date: '2026-07-18', zone_id: 3, zone_name: 'Revir', qty_base: 12, record_count: 1 },
]

beforeEach(() => {
  vi.clearAllMocks()
  queryMocks.getProduct.mockReturnValue(PRODUCT)
  queryMocks.productDistributionCells.mockReturnValue(CELLS)
})

describe('ürün dağıtım dökümü', () => {
  it('gün → yer kırılımı verir, günler yeniden eskiye sıralanır', () => {
    const report = productDistributionService({ product_id: 7, from: '2026-07-01', to: '2026-07-31' })

    expect(report.days.map(day => day.date)).toEqual(['2026-07-20', '2026-07-18'])
    expect(report.days[0].total_base).toBe(300)
    expect(report.days[0].zones.map(zone => [zone.zone_name, zone.qty_base]))
      .toEqual([['Yemekhane', 240], ['Şantiye Ofis', 60]])
  })

  it('yer → gün kırılımı verir, paylar toplama göre hesaplanır', () => {
    const report = productDistributionService({ product_id: 7 })

    expect(report.zones.map(zone => [zone.zone_name, zone.total_base]))
      .toEqual([['Yemekhane', 360], ['Şantiye Ofis', 60], ['Revir', 12]])
    // 360 / 432 = %83.3
    expect(report.zones[0].share_pct).toBe(83.3)
    expect(report.zones[0].day_count).toBe(2)
    expect(report.zones[0].last_date).toBe('2026-07-20')
    expect(report.zones[0].days.map(day => day.date)).toEqual(['2026-07-20', '2026-07-18'])
  })

  it('KPI toplamlarını ve insan-okur miktarları üretir', () => {
    const report = productDistributionService({ product_id: 7 })

    expect(report.totals).toMatchObject({
      total_base: 432,
      day_count: 2,
      zone_count: 3,
      record_count: 5,
      daily_avg_base: 216,
      first_date: '2026-07-18',
      last_date: '2026-07-20',
    })
    // 240 şişe = 20 koli
    expect(report.days[0].zones[0].qty_human).toBe('20 koli')
    expect(report.product).toMatchObject({ id: 7, name: '0.33 L Şişe Su', brand_name: 'Mila' })
  })

  it('dönem verilmezse ilk/son hareket tarihini dönem olarak yazar', () => {
    const report = productDistributionService({ product_id: 7 })
    expect(report.from).toBe('2026-07-18')
    expect(report.to).toBe('2026-07-20')
  })

  it('hiç dağıtım yoksa boş ama tutarlı sonuç döner', () => {
    queryMocks.productDistributionCells.mockReturnValue([])
    const report = productDistributionService({ product_id: 7 })

    expect(report.days).toEqual([])
    expect(report.zones).toEqual([])
    expect(report.totals).toMatchObject({ total_base: 0, day_count: 0, zone_count: 0, daily_avg_base: 0 })
    // 0'a bölme yok
    expect(report.totals.first_date).toBe(null)
  })

  it('yeri belirtilmemiş dağıtım kaybolmaz', () => {
    queryMocks.productDistributionCells.mockReturnValue([
      { date: '2026-07-20', zone_id: null, zone_name: 'Yer belirtilmemiş', qty_base: 24, record_count: 1 },
    ])
    const report = productDistributionService({ product_id: 7 })
    expect(report.zones).toHaveLength(1)
    expect(report.zones[0]).toMatchObject({ zone_id: null, zone_name: 'Yer belirtilmemiş', total_base: 24 })
  })

  it('geçersiz girdileri reddeder', () => {
    expect(() => productDistributionService({ product_id: 0 })).toThrow(/Geçersiz ürün/)
    expect(() => productDistributionService({ product_id: 7, from: '20-07-2026' })).toThrow(/başlangıç tarihi/i)
    expect(() => productDistributionService({ product_id: 7, to: 'dün' })).toThrow(/bitiş tarihi/i)
    expect(() => productDistributionService({ product_id: 7, from: '2026-07-20', to: '2026-07-01' }))
      .toThrow(/Başlangıç bitişten sonra/)
  })

  it('olmayan ürün 404 verir', () => {
    queryMocks.getProduct.mockReturnValue(undefined)
    expect(() => productDistributionService({ product_id: 999 })).toThrow(/Ürün bulunamadı/)
    try {
      productDistributionService({ product_id: 999 })
    } catch (error) {
      expect(error.status).toBe(404)
    }
  })
})
