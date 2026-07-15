import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = vi.hoisted(() => ({
  consumptionRates: vi.fn(),
  dailySeries: vi.fn(),
  depositBalances: vi.fn(),
  monthlySeries: vi.fn(),
  periodFlow: vi.fn(),
  productFlow: vi.fn(),
  stockByProduct: vi.fn(),
  zoneTotals: vi.fn(),
}))

vi.mock('./queries.js', () => queryMocks)

import { depositService, forecastService, summaryService, trendsService } from './analytics.js'

describe('water analytics module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMocks.consumptionRates.mockReturnValue([])
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
      needs_order: true,
      suggested_base: 220,
      confidence: 'ok',
    })
    expect(result.rows[1]).toMatchObject({ needs_order: false, suggested_base: 0, confidence: 'low' })
    expect(result.order_suggestions.map(row => row.product_id)).toEqual([1])
    expect(result.totals).toEqual({ products: 2, order_count: 1, soon_count: 0 })
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
