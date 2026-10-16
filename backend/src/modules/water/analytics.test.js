import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = vi.hoisted(() => ({
  consumptionRates: vi.fn(),
  recordedOutDays: vi.fn(),
  lastOutDate: vi.fn(),
  dailySeries: vi.fn(),
  depositBalances: vi.fn(),
  monthlySeries: vi.fn(),
  periodFlow: vi.fn(),
  productFlow: vi.fn(),
  stockByProduct: vi.fn(),
  zoneTotals: vi.fn(),
}))

vi.mock('./queries.js', () => queryMocks)

import { dataCoverage, depositService, forecastService, summaryService, trendsService } from './analytics.js'

describe('water analytics module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMocks.consumptionRates.mockReturnValue([])
    queryMocks.recordedOutDays.mockReturnValue([])
    queryMocks.lastOutDate.mockReturnValue(null)
    queryMocks.dailySeries.mockReturnValue([])
    queryMocks.depositBalances.mockReturnValue([])
    queryMocks.monthlySeries.mockReturnValue([])
    queryMocks.periodFlow.mockReturnValue({ period_in: 0, period_out: 0 })
    queryMocks.productFlow.mockReturnValue([])
    queryMocks.stockByProduct.mockReturnValue([])
    queryMocks.zoneTotals.mockReturnValue([])
  })

  it('calculates returnable-container balances with human quantities', () => {
    queryMocks.depositBalances.mockReturnValue([{
      id: 4,
      name: 'Damacana',
      brand_id: 2,
      brand_name: 'Mila',
      unit_label: 'adet',
      units_per_case: 1,
      cases_per_pallet: 36,
      total_in: 108,
      total_return: 36,
      period_return: 18,
    }])

    expect(depositService({ from: '2026-07-01', to: '2026-07-31' })).toEqual([expect.objectContaining({
      product_id: 4,
      outstanding: 72,
      total_in_human: '3 palet',
      total_return_human: '1 palet',
      period_return_human: '18 adet',
      outstanding_human: '2 palet',
    })])
    expect(queryMocks.depositBalances).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('builds order suggestions from consumption, stock and cover days', () => {
    queryMocks.consumptionRates.mockReturnValue([
      { product_id: 1, out_sum: 300, active_days: 15 },
      { product_id: 2, out_sum: 10, active_days: 1 },
    ])
    queryMocks.stockByProduct.mockReturnValue([
      {
        id: 1,
        name: 'Bardak Su',
        unit_label: 'koli',
        units_per_case: 1,
        cases_per_pallet: 66,
        lead_time_days: 12,
        safety_stock_days: 4,
        total_in: 100,
        total_out: 20,
        adjust_net: 0,
      },
      {
        id: 2,
        name: 'Cam Su',
        unit_label: 'paket',
        units_per_case: 1,
        cases_per_pallet: 133,
        total_in: 20,
        total_out: 10,
        adjust_net: 0,
      },
    ])

    const result = forecastService({ today: '2026-07-15', window: 30, targetDays: 30 })

    expect(queryMocks.consumptionRates).toHaveBeenCalledWith({ window: 30, asOf: '2026-07-15' })
    expect(result.rows[0]).toMatchObject({
      balance: 80,
      avg_daily: 10,
      days_of_cover: 8,
      stockout_date: '2026-07-23',
      lead_time_days: 12,
      safety_stock_days: 4,
      reorder_point_days: 16,
      order_due_in_days: -8,
      order_by_date: '2026-07-07',
      order_urgency: 'overdue',
      needs_order: true,
      suggested_base: 220,
      confidence: 'ok',
    })
    expect(result.rows[1]).toMatchObject({ needs_order: false, suggested_base: 0, confidence: 'low' })
    expect(result.order_suggestions.map(row => row.product_id)).toEqual([1])
    expect(result.totals).toEqual({ products: 2, order_count: 1, overdue_order_count: 1, due_soon_order_count: 0, soon_count: 0 })
  })

  it('counts recorded days plus unrecorded Sundays between them; unrecorded weekdays are unknown', () => {
    // 2026-10-01 Per … 10 Cmt kayıtlı (4 Pazar boş), 11 Pazar, 12–15 girilmedi
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07',
      '2026-10-08', '2026-10-09', '2026-10-10']
    expect(dataCoverage(dates, '2026-10-16')).toEqual({
      recorded_days: 9,
      covered_days: 10,          // 9 kayıtlı + 04.10 Pazar
      first_date: '2026-10-01',
      last_date: '2026-10-10',
      gap_days: 0,
      missing_since_last: 4,     // 12, 13, 14, 15 (11 Pazar sayılmaz, bugün henüz girilmemiş olabilir)
      stale: true,
    })
    const withGap = dataCoverage(['2026-10-01', '2026-10-03', '2026-10-15'], '2026-10-16')
    expect(withGap).toMatchObject({ covered_days: 5, gap_days: 10, missing_since_last: 0, stale: false }) // 3 + 4 ve 11 Pazar
    expect(dataCoverage(['2026-10-14'], '2026-10-16')).toMatchObject({ missing_since_last: 1, stale: false })
    expect(dataCoverage([], '2026-10-16')).toMatchObject({ covered_days: 0, last_date: null, stale: false })
    // pencerede hiç kayıt yok ama daha eskisi var → yine bayat (30+ gündür girilmiyor)
    expect(dataCoverage([], '2026-10-16', '2026-09-01')).toMatchObject({ covered_days: 0, last_date: '2026-09-01', stale: true })
  })

  it('divides consumption by covered days, not by the whole window, and flags stale data', () => {
    queryMocks.recordedOutDays.mockReturnValue(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06',
      '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
    queryMocks.consumptionRates.mockReturnValue([{ product_id: 8, out_sum: 4212, active_days: 9 }])
    queryMocks.stockByProduct.mockReturnValue([{
      id: 8, name: 'Damacana', brand_name: 'AVRİL', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36,
      total_in: 18828, total_out: 17820, adjust_net: -396,
    }])

    const result = forecastService({ today: '2026-10-16', window: 30, targetDays: 30 })

    expect(queryMocks.recordedOutDays).toHaveBeenCalledWith({ window: 30, asOf: '2026-10-16' })
    expect(result.data_coverage).toMatchObject({ covered_days: 10, last_date: '2026-10-10', stale: true })
    expect(result.rows[0]).toMatchObject({
      balance: 612,
      avg_daily: 421.2,          // 4212 / 10 kayıtlı gün — eskiden 4212 / 30 = 140.4
      days_of_cover: 1,          // eskiden 4 gün sanılıyordu
      confidence: 'stale',
    })
  })

  it('uses each product lead and safety days when deciding whether to order', () => {
    queryMocks.consumptionRates.mockReturnValue([
      { product_id: 1, out_sum: 300, active_days: 10 },
      { product_id: 2, out_sum: 300, active_days: 10 },
    ])
    queryMocks.stockByProduct.mockReturnValue([
      { id: 1, name: 'Hızlı Tedarik', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1, lead_time_days: 2, safety_stock_days: 1, total_in: 80, total_out: 0, adjust_net: 0 },
      { id: 2, name: 'Yavaş Tedarik', unit_label: 'adet', units_per_case: 1, cases_per_pallet: 1, lead_time_days: 35, safety_stock_days: 5, total_in: 80, total_out: 0, adjust_net: 0 },
    ])

    const result = forecastService({ today: '2026-07-15', window: 30, targetDays: 30 })

    expect(result.rows.find(row => row.product_id === 1)).toMatchObject({
      days_of_cover: 8,
      reorder_point_days: 3,
      order_due_in_days: 5,
      order_by_date: '2026-07-20',
      needs_order: false,
      order_urgency: 'planned',
    })
    expect(result.rows.find(row => row.product_id === 2)).toMatchObject({
      days_of_cover: 8,
      reorder_point_days: 40,
      target_stock_days: 40,
      order_due_in_days: -32,
      order_by_date: '2026-06-13',
      needs_order: true,
      suggested_base: 320,
      order_urgency: 'overdue',
    })
  })

  it('normalizes trend range and aggregates zones across products', () => {
    queryMocks.monthlySeries.mockReturnValue([
      { move_date: '2026-05', in_base: 50, out_base: 20 },
    ])
    queryMocks.zoneTotals.mockReturnValue([
      { id: 1, name: 'FPU', total_out: 3 },
      { id: 1, name: 'FPU', total_out: 7 },
      { id: 2, name: 'OTC', total_out: 20 },
    ])
    queryMocks.productFlow.mockReturnValue([
      { id: 3, name: 'Damacana', unit_label: 'adet', cases_per_pallet: 36, period_out: 72 },
      { id: 4, name: 'Bardak Su', unit_label: 'koli', cases_per_pallet: 66, period_out: 0 },
    ])

    const result = trendsService({ today: '2026-07-15', months: 3 })

    expect(result).toMatchObject({ from: '2026-05-01', to: '2026-07-15', months: 3 })
    expect(result.monthly).toEqual([{ month: '2026-05', in_base: 50, out_base: 20 }])
    expect(result.zones).toEqual([
      { zone_id: 2, zone_name: 'OTC', total: 20 },
      { zone_id: 1, zone_name: 'FPU', total: 10 },
    ])
    expect(result.products).toEqual([expect.objectContaining({ product_id: 3, out: 72, out_human: '2 palet' })])
  })

  it('combines stock, period, zone and deposit metrics in one dashboard result', () => {
    queryMocks.productFlow.mockReturnValue([
      { id: 1, period_in: 2, period_out: 8 },
      { id: 2, period_in: 6, period_out: 1 },
    ])
    queryMocks.stockByProduct.mockReturnValue([
      {
        id: 1,
        name: 'Damacana',
        unit_label: 'adet',
        units_per_case: 1,
        cases_per_pallet: 36,
        total_in: 10,
        total_out: 15,
        adjust_net: 1,
        min_level: 5,
        critical_level: 2,
      },
      {
        id: 2,
        name: 'Bardak Su',
        unit_label: 'koli',
        units_per_case: 1,
        cases_per_pallet: 66,
        total_in: 20,
        total_out: 5,
        adjust_net: 0,
        min_level: 10,
        critical_level: 5,
      },
    ])
    queryMocks.zoneTotals.mockReturnValue([
      { id: 7, name: 'FPU', product_id: 1, product_name: 'Damacana', unit_label: 'adet', total_out: 8 },
    ])
    queryMocks.dailySeries.mockReturnValue([{ move_date: '2026-07-15', in_base: 2, out_base: 8 }])
    queryMocks.periodFlow.mockReturnValue({ period_in: 8, period_out: 9 })
    queryMocks.depositBalances.mockReturnValue([{
      id: 1,
      name: 'Damacana',
      unit_label: 'adet',
      units_per_case: 1,
      cases_per_pallet: 36,
      total_in: 10,
      total_return: 4,
      period_return: 2,
    }])

    const result = summaryService({
      from: '2026-07-01',
      to: '2026-07-31',
      product_id: 1,
      group: 'day',
    })

    expect(result.stock[0]).toMatchObject({
      balance: -4,
      deficit: 4,
      period_net: -6,
      period_status: 'period_deficit',
      low: true,
      critical: true,
      negative: true,
    })
    expect(result.stock[1]).toMatchObject({ balance: 15, period_net: 5, period_status: 'period_surplus' })
    expect(result.zones).toEqual([expect.objectContaining({ zone_id: 7, total_out: 8, out_human: '8 adet' })])
    expect(result.daily).toEqual([{ move_date: '2026-07-15', in_base: 2, out_base: 8 }])
    expect(result.totals).toEqual({
      period_in: 8,
      period_out: 9,
      period_net: -1,
      balance: 11,
      deficit_total: 4,
      deficit_count: 1,
      period_deficit_count: 1,
      low_count: 1,
      critical_count: 1,
      period_return: 2,
      outstanding: 6,
    })
    expect(queryMocks.dailySeries).toHaveBeenCalledWith({
      from: '2026-07-01', to: '2026-07-31', product_id: 1,
    })
  })

  it('uses monthly series when the dashboard group is month', () => {
    queryMocks.monthlySeries.mockReturnValue([{ move_date: '2026-07', in_base: 8, out_base: 9 }])

    const result = summaryService({ from: '2026-07-01', to: '2026-07-31', group: 'month' })

    expect(result.group).toBe('month')
    expect(result.daily).toEqual([{ move_date: '2026-07', in_base: 8, out_base: 9 }])
    expect(queryMocks.monthlySeries).toHaveBeenCalledWith({
      from: '2026-07-01', to: '2026-07-31', product_id: undefined,
    })
    expect(queryMocks.dailySeries).not.toHaveBeenCalled()
  })
})
