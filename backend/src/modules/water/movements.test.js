import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = vi.hoisted(() => ({
  addMovementAllocations: vi.fn(),
  clearResolvedReviews: vi.fn(),
  createMovement: vi.fn(),
  createMovementsBatch: vi.fn(),
  createMovementsBatchWithAllocations: vi.fn(),
  deleteMovement: vi.fn(),
  flagReviewForUnallocated: vi.fn(),
  getMovement: vi.fn(),
  getProduct: vi.fn(),
  getZone: vi.fn(),
  intakeAllocationUsage: vi.fn(),
  listMovements: vi.fn(),
  openDistributionNeeds: vi.fn(),
  openIntakeLots: vi.fn(),
  runInTransaction: vi.fn(),
  updateMovementWithAllocations: vi.fn(),
}))
const assertMonthUnlocked = vi.hoisted(() => vi.fn())
const checkLowStock = vi.hoisted(() => vi.fn())

vi.mock('./queries.js', () => queryMocks)
vi.mock('./reconciliation.js', () => ({ assertMonthUnlocked }))
vi.mock('./notifications.js', () => ({ checkLowStock }))

import {
  batchDistributeService,
  createDistributionService,
  createIntakeService,
  deleteMovementService,
  movementsService,
  updateDistributionService,
} from './movements.js'

describe('water movement and FIFO services', () => {
  const products = {
    1: {
      id: 1,
      name: 'Damacana',
      unit_label: 'adet',
      units_per_case: 1,
      cases_per_pallet: 36,
      min_level: 10,
    },
    2: {
      id: 2,
      name: 'Bardak Su',
      unit_label: 'koli',
      units_per_case: 1,
      cases_per_pallet: 66,
      min_level: 10,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryMocks.addMovementAllocations.mockImplementation(rows => rows.length)
    queryMocks.createMovement.mockReturnValue(41)
    queryMocks.createMovementsBatch.mockReturnValue([41])
    queryMocks.createMovementsBatchWithAllocations.mockReturnValue([91])
    queryMocks.getProduct.mockImplementation(id => products[id])
    queryMocks.getZone.mockImplementation(id => id ? { id, name: `Bölge ${id}` } : undefined)
    queryMocks.intakeAllocationUsage.mockReturnValue({ allocated_base: 0, distribution_count: 0 })
    queryMocks.listMovements.mockReturnValue([])
    queryMocks.openDistributionNeeds.mockReturnValue([])
    queryMocks.openIntakeLots.mockReturnValue([])
    queryMocks.runInTransaction.mockImplementation(operation => operation())
    queryMocks.updateMovementWithAllocations.mockReturnValue(true)
  })

  it('allocates a distribution from FIFO lots in order and flags any remainder', () => {
    queryMocks.openIntakeLots.mockReturnValue([
      { id: 11, remaining_base: 50 },
      { id: 12, remaining_base: 30 },
    ])

    expect(createDistributionService({
      product_id: 1,
      zone_id: 7,
      move_date: '2026-07-15',
      input_qty: 2,
      input_unit: 'palet',
      note: '  FPU teslim  ',
    }, 5)).toBe(91)

    expect(queryMocks.createMovementsBatchWithAllocations).toHaveBeenCalledWith([{
      movement: {
        type: 'out',
        product_id: 1,
        zone_id: 7,
        move_date: '2026-07-15',
        qty_base: 72,
        input_qty: 2,
        input_unit: 'palet',
        waybill_no: null,
        note: 'FPU teslim',
        created_by: 5,
      },
      allocations: [
        { in_movement_id: 11, qty_base: 50 },
        { in_movement_id: 12, qty_base: 22 },
      ],
    }])
    expect(queryMocks.flagReviewForUnallocated).toHaveBeenCalledWith([91])
    expect(checkLowStock).toHaveBeenCalledWith([1])
  })

  it('creates intake and reconciles older unallocated distributions atomically', () => {
    queryMocks.createMovement.mockReturnValue(42)
    queryMocks.openIntakeLots.mockReturnValue([{ id: 42, remaining_base: 36 }])
    queryMocks.openDistributionNeeds.mockReturnValue([{ id: 88, unallocated_base: 20 }])

    expect(createIntakeService({
      product_id: 1,
      move_date: '2026-07-15',
      input_qty: 1,
      input_unit: 'palet',
      waybill_no: '  IRS-15  ',
    }, 6)).toBe(42)

    expect(queryMocks.runInTransaction).toHaveBeenCalledOnce()
    expect(queryMocks.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      type: 'in', product_id: 1, qty_base: 36, input_qty: 1, waybill_no: 'IRS-15', created_by: 6,
    }))
    expect(queryMocks.addMovementAllocations).toHaveBeenCalledWith([
      { out_movement_id: 88, in_movement_id: 42, qty_base: 20 },
    ])
    expect(queryMocks.clearResolvedReviews).toHaveBeenCalledWith([1])
  })

  it('protects allocated intake rows and reassigns FIFO after deleting an output', () => {
    queryMocks.getMovement.mockReturnValueOnce({ id: 10, type: 'in', product_id: 1, move_date: '2026-07-15' })
    queryMocks.intakeAllocationUsage.mockReturnValueOnce({ allocated_base: 18, distribution_count: 2 })

    expect(() => deleteMovementService(10)).toThrowError(expect.objectContaining({
      statusCode: 409,
      message: expect.stringContaining('2 dağıtıma toplam 18'),
    }))
    expect(queryMocks.deleteMovement).not.toHaveBeenCalled()

    queryMocks.getMovement.mockReturnValueOnce({ id: 20, type: 'out', product_id: 1, move_date: '2026-07-15' })
    queryMocks.openIntakeLots.mockReturnValueOnce([{ id: 11, remaining_base: 12 }])
    queryMocks.openDistributionNeeds.mockReturnValueOnce([{ id: 21, unallocated_base: 8 }])

    expect(deleteMovementService(20)).toMatchObject({ id: 20, type: 'out' })
    expect(queryMocks.deleteMovement).toHaveBeenCalledWith(20)
    expect(queryMocks.addMovementAllocations).toHaveBeenCalledWith([
      { out_movement_id: 21, in_movement_id: 11, qty_base: 8 },
    ])
    expect(queryMocks.clearResolvedReviews).toHaveBeenCalledWith([1])
  })

  it('reconciles both products when a distribution product changes', () => {
    queryMocks.getMovement.mockReturnValue({
      id: 30,
      type: 'out',
      product_id: 1,
      move_date: '2026-07-14',
      created_by: 12,
    })

    updateDistributionService(30, {
      product_id: 2,
      zone_id: 9,
      move_date: '2026-07-15',
      input_qty: 2,
      input_unit: 'palet',
    }, 99)

    expect(queryMocks.updateMovementWithAllocations).toHaveBeenCalledWith(30, {
      movement: expect.objectContaining({
        product_id: 2,
        zone_id: 9,
        qty_base: 132,
        created_by: 12,
      }),
      allocations: [],
    })
    expect(queryMocks.openIntakeLots).toHaveBeenCalledWith(1)
    expect(queryMocks.openIntakeLots).toHaveBeenCalledWith(2)
    expect(queryMocks.clearResolvedReviews).toHaveBeenCalledWith([1, 2])
    expect(queryMocks.flagReviewForUnallocated).toHaveBeenCalledWith([30])
    expect(checkLowStock).toHaveBeenCalledWith([1, 2])
  })

  it('shares available lots across rows in the same distribution batch', () => {
    queryMocks.openIntakeLots.mockReturnValue([{ id: 55, remaining_base: 100 }])
    queryMocks.createMovementsBatchWithAllocations.mockImplementation(plans => plans.map((_, index) => index + 1))

    expect(batchDistributeService({
      move_date: '2026-07-15',
      lines: [
        { product_id: 1, zone_id: 1, input_qty: 60, input_unit: 'adet' },
        { product_id: 1, zone_id: 2, input_qty: 60, input_unit: 'adet' },
      ],
    }, 4)).toEqual([1, 2])

    const plans = queryMocks.createMovementsBatchWithAllocations.mock.calls[0][0]
    expect(plans[0].allocations).toEqual([{ in_movement_id: 55, qty_base: 60 }])
    expect(plans[1].allocations).toEqual([{ in_movement_id: 55, qty_base: 40 }])
    expect(queryMocks.openIntakeLots).toHaveBeenCalledTimes(1)
    expect(queryMocks.flagReviewForUnallocated).toHaveBeenCalledWith([1, 2])
  })

  it('decorates movement rows with allocation state and human quantities', () => {
    queryMocks.listMovements.mockReturnValue([
      {
        id: 1,
        type: 'out',
        unit_label: 'adet',
        units_per_case: 1,
        cases_per_pallet: 36,
        qty_base: 72,
        allocated_base: 36,
        unallocated_base: 36,
      },
      {
        id: 2,
        type: 'in',
        unit_label: 'adet',
        units_per_case: 1,
        cases_per_pallet: 36,
        qty_base: 36,
        intake_allocated_base: 36,
        remaining_base: 0,
      },
    ])

    expect(movementsService({ type: 'all' })).toEqual([
      expect.objectContaining({
        id: 1,
        qty_human: '2 palet',
        allocation_human: '1 palet',
        unallocated_human: '1 palet',
        allocation_status: 'pending',
      }),
      expect.objectContaining({
        id: 2,
        qty_human: '1 palet',
        intake_allocated_human: '1 palet',
        remaining_human: '0 adet',
        allocation_status: 'closed',
      }),
    ])
  })
})
