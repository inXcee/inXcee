import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getProductBalance: vi.fn(),
}))
const createNotification = vi.hoisted(() => vi.fn())

vi.mock('./queries.js', () => queryMocks)
vi.mock('../../shared/notifications/service.js', () => ({ createNotification }))

import { WATER_OPERATION_ROLES, checkLowStock, notifyWaterOperations } from './notifications.js'

describe('water operation notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createNotification.mockImplementation(payload => payload.target_role)
  })

  it('fans out to both operation roles while preserving the primary dedup key', () => {
    expect(Object.isFrozen(WATER_OPERATION_ROLES)).toBe(true)

    expect(notifyWaterOperations({
      message: 'Kontrol gerekli',
      module: 'water',
      dedup_key: 'water_check_2026-07-15',
    })).toEqual(['campus_manager', 'shift_supervisor'])
    expect(createNotification).toHaveBeenNthCalledWith(1, {
      message: 'Kontrol gerekli',
      module: 'water',
      target_role: 'campus_manager',
      dedup_key: 'water_check_2026-07-15',
    })
    expect(createNotification).toHaveBeenNthCalledWith(2, {
      message: 'Kontrol gerekli',
      module: 'water',
      target_role: 'shift_supervisor',
      dedup_key: 'water_check_2026-07-15_shift_supervisor',
    })
  })

  it('deduplicates products and warns only when a configured threshold is crossed', () => {
    queryMocks.getProduct.mockImplementation(id => ({
      3: {
        id: 3,
        name: 'Damacana',
        unit_label: 'adet',
        units_per_case: 1,
        cases_per_pallet: 36,
        min_level: 72,
      },
      4: { id: 4, name: 'Cam Su', unit_label: 'paket', min_level: 0 },
    })[id])
    queryMocks.getProductBalance.mockReturnValue(36)

    checkLowStock([3, 3, 4])

    expect(queryMocks.getProduct).toHaveBeenCalledTimes(2)
    expect(queryMocks.getProductBalance).toHaveBeenCalledOnce()
    expect(queryMocks.getProductBalance).toHaveBeenCalledWith(3)
    expect(createNotification).toHaveBeenCalledTimes(2)
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      target_role: 'campus_manager',
      severity: 'warning',
      module: 'water',
      dedup_key: 'water_low_3',
      message: 'Su stoğu düşük: Damacana — kalan 1 palet (eşik 2 palet)',
    })
  })

  it('does not warn at or above the configured minimum', () => {
    queryMocks.getProduct.mockReturnValue({
      id: 5,
      name: 'Bardak Su',
      unit_label: 'koli',
      cases_per_pallet: 66,
      min_level: 20,
    })
    queryMocks.getProductBalance.mockReturnValue(20)

    checkLowStock(5)

    expect(createNotification).not.toHaveBeenCalled()
  })
})
