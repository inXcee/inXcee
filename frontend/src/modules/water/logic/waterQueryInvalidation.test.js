import { describe, expect, it, vi } from 'vitest'
import {
  invalidateWaterQueries,
  waterQueryKeysForScopes,
} from './waterQueryInvalidation.js'

describe('water query invalidation', () => {
  it('distribution kapsamındaki bütün türetilmiş ekranları yeniler', () => {
    const keys = waterQueryKeysForScopes('distribution')

    expect(keys).toEqual(expect.arrayContaining([
      'water-daily-ledger',
      'water-summary',
      'water-pivot',
      'water-zone-history',
      'water-pending',
      'water-reconciliation',
      'water-forecast',
      'water-trends',
      'water-lots',
    ]))
  })

  it('çakışan kapsamları tek cache taramasında birleştirir', async () => {
    const queryClient = { invalidateQueries: vi.fn(() => Promise.resolve()) }

    await invalidateWaterQueries(queryClient, 'distribution', 'intake')

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1)
    const { predicate } = queryClient.invalidateQueries.mock.calls[0][0]
    expect(predicate({ queryKey: ['water-intake', '2026-07'] })).toBe(true)
    expect(predicate({ queryKey: ['water-day', '2026-07-15'] })).toBe(true)
    expect(predicate({ queryKey: ['water-alerts', '2026-07-15'] })).toBe(true)
    expect(predicate({ queryKey: ['shifts-schedule', '2026-07'] })).toBe(false)
  })

  it('ürün değişikliğinde stok, rapor ve geçmiş querylerini birlikte kapsar', () => {
    expect(waterQueryKeysForScopes('products')).toEqual(expect.arrayContaining([
      'water-products-all',
      'water-products',
      'water-summary',
      'water-reconciliation',
      'water-daily-ledger',
      'water-zone-history',
      'water-lots',
    ]))
  })

  it('lot güncellemesinde lot, irsaliye, uyarı ve dağıtım geçmişini yeniler', () => {
    expect(waterQueryKeysForScopes('lots')).toEqual(expect.arrayContaining([
      'water-lots',
      'water-intake',
      'water-pending',
      'water-alerts',
      'water-daily-ledger',
      'water-zone-history',
    ]))
  })

  it('yanlış kapsam adını sessizce yutmaz', () => {
    expect(() => waterQueryKeysForScopes('missing')).toThrow('Bilinmeyen su sorgu kapsamı')
  })
})
