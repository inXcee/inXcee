import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = vi.hoisted(() => ({
  getClosure: vi.fn(),
  getProduct: vi.fn(),
  reconciliationRow: vi.fn(),
  reconciliationRows: vi.fn(),
  runInTransaction: vi.fn(),
  setClosureLock: vi.fn(),
  snapshotClosure: vi.fn(),
  upsertClosure: vi.fn(),
  upsertStockCount: vi.fn(),
}))

vi.mock('./queries.js', () => queryMocks)

import {
  COUNT_REASONS,
  assertMonthUnlocked,
  isCountReason,
  monthlyCloseService,
  monthlyUnlockService,
  reconciliationService,
  saveStockCountService,
  writeReconciliationPDF,
} from './reconciliation.js'

describe('water reconciliation module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMocks.getClosure.mockReturnValue(undefined)
    queryMocks.reconciliationRows.mockReturnValue([])
    queryMocks.runInTransaction.mockImplementation(work => work())
  })

  it('publishes one immutable reason contract for counts and adjustments', () => {
    expect(Object.isFrozen(COUNT_REASONS)).toBe(true)
    expect(COUNT_REASONS.every(reason => Object.isFrozen(reason))).toBe(true)
    expect(isCountReason('sayim_farki')).toBe(true)
    expect(isCountReason('bilinmeyen')).toBe(false)
  })

  it('resolves full dates to their month and blocks locked periods', () => {
    queryMocks.getClosure.mockReturnValue({ month: '2026-07', is_locked: 1 })

    expect(() => assertMonthUnlocked('2026-07-15')).toThrowError(expect.objectContaining({
      statusCode: 423,
      message: expect.stringContaining('2026-07 ayı kilitli'),
    }))
    expect(queryMocks.getClosure).toHaveBeenCalledWith('2026-07')

    queryMocks.getClosure.mockClear()
    expect(() => assertMonthUnlocked('geçersiz')).not.toThrow()
    expect(queryMocks.getClosure).not.toHaveBeenCalled()
  })

  it('calculates row statuses, human values and reconciliation totals', () => {
    queryMocks.getClosure.mockReturnValue({ month: '2026-07', is_locked: 1 })
    queryMocks.reconciliationRows.mockReturnValue([
      {
        product_id: 1,
        product_name: 'Damacana',
        unit_label: 'adet',
        units_per_case: 1,
        cases_per_pallet: 36,
        opening_base: 36,
        month_in: 72,
        month_out: 30,
        month_adjust: -2,
        month_return: 4,
        counted_base: 75,
        count_reason: 'sayim_farki',
        count_note: 'Kontrol edildi',
      },
      {
        product_id: 2,
        product_name: 'Bardak Su',
        unit_label: 'koli',
        units_per_case: 1,
        cases_per_pallet: 66,
        opening_base: 10,
        month_in: 5,
        month_out: 15,
        month_adjust: 0,
        month_return: 0,
        counted_base: null,
      },
    ])

    const result = reconciliationService({ month: '2026-07' })

    expect(result.locked).toBe(true)
    expect(result.rows[0]).toMatchObject({
      system_base: 76,
      counted_base: 75,
      diff_base: -1,
      status: 'short',
      system_human: '2 palet 4 adet',
      diff_human: '-1 adet',
    })
    expect(result.rows[1]).toMatchObject({ system_base: 0, diff_base: null, status: 'pending' })
    expect(result.totals).toEqual({ products: 2, counted: 1, pending: 1, mismatch: 1, system_base: 76 })
  })

  it('validates count differences and persists normalized base quantities', () => {
    queryMocks.getProduct.mockReturnValue({
      id: 8,
      name: 'Damacana',
      unit_label: 'adet',
      units_per_case: 1,
      cases_per_pallet: 36,
    })
    queryMocks.reconciliationRow.mockReturnValue({
      opening_base: 36,
      month_in: 72,
      month_out: 36,
      month_adjust: 0,
    })

    expect(() => saveStockCountService({
      month: '2026-07',
      product_id: 8,
      counted_qty: 3,
      counted_unit: 'palet',
    }, 5)).toThrowError(/sebep.*zorunlu/)

    const result = saveStockCountService({
      month: '2026-07',
      product_id: 8,
      counted_qty: 3,
      counted_unit: 'palet',
      reason: 'sayim_farki',
      note: '  Fiziki sayım  ',
    }, 5)

    expect(result).toEqual({ system_base: 72, counted_base: 108, diff_base: 36, status: 'over' })
    expect(queryMocks.upsertStockCount).toHaveBeenCalledWith({
      month: '2026-07',
      product_id: 8,
      system_base: 72,
      counted_base: 108,
      diff_base: 36,
      reason: 'sayim_farki',
      note: 'Fiziki sayım',
      created_by: 5,
    })
  })

  it('snapshots closing balances and only unlocks an existing closure', () => {
    queryMocks.reconciliationRows.mockReturnValue([
      { product_id: 3, opening_base: 10, month_in: 5, month_out: 4, month_adjust: -1 },
    ])
    queryMocks.getClosure.mockReturnValue({ month: '2026-07', is_locked: 1 })

    expect(monthlyCloseService({ month: '2026-07', note: '  Tamam  ' }, 9)).toEqual({
      month: '2026-07',
      is_locked: 1,
    })
    expect(queryMocks.snapshotClosure).toHaveBeenCalledWith('2026-07', [{ product_id: 3, system_base: 10 }])
    expect(queryMocks.upsertClosure).toHaveBeenCalledWith({
      month: '2026-07', note: 'Tamam', closed_by: 9, is_locked: 1,
    })

    monthlyUnlockService('2026-07')
    expect(queryMocks.setClosureLock).toHaveBeenCalledWith('2026-07', 0)

    queryMocks.getClosure.mockReturnValue(undefined)
    expect(() => monthlyUnlockService('2026-08')).toThrowError(expect.objectContaining({ statusCode: 404 }))
  })

  it('builds the month range and renders through an injected summary provider', () => {
    const doc = {
      end: vi.fn(),
      fillColor: vi.fn(),
      font: vi.fn(),
      fontSize: vi.fn(),
      moveDown: vi.fn(),
      text: vi.fn(),
    }
    for (const method of ['fillColor', 'font', 'fontSize', 'moveDown', 'text']) {
      doc[method].mockReturnValue(doc)
    }
    const summaryProvider = vi.fn().mockReturnValue({
      totals: { period_in: 10, period_out: 4, balance: 6 },
      zones: [{ zone_id: 2, zone_name: 'FPU', total_out: 4 }],
      stock: [],
    })

    expect(writeReconciliationPDF('2028-02', doc, summaryProvider)).toEqual({
      month: '2028-02', from: '2028-02-01', to: '2028-02-29',
    })
    expect(summaryProvider).toHaveBeenCalledWith({ from: '2028-02-01', to: '2028-02-29' })
    expect(doc.end).toHaveBeenCalledOnce()
  })
})
