import { describe, expect, it } from 'vitest'
import {
  applyMatrixChanges,
  createMatrixDraftState,
  matrixVirtualWindow,
  matrixDraftReducer,
  matrixPasteChanges,
  nextMatrixPosition,
  updateMatrixCell,
} from './waterMatrix.js'

describe('water matrix draft', () => {
  it('changes only the edited zone row reference', () => {
    const initial = {
      1: { 10: '2' },
      2: { 10: '4' },
    }

    const next = updateMatrixCell(initial, 1, 10, '3')

    expect(next).not.toBe(initial)
    expect(next['1']).not.toBe(initial['1'])
    expect(next['2']).toBe(initial['2'])
    expect(next['1']['10']).toBe('3')
  })

  it('removes empty rows and keeps unchanged updates referentially stable', () => {
    const initial = { 1: { 10: '2' } }
    expect(updateMatrixCell(initial, 1, 10, '2')).toBe(initial)
    expect(updateMatrixCell(initial, 1, 10, '')).toEqual({})
  })

  it('applies a rectangular Excel paste without touching unrelated rows', () => {
    const cells = { 3: { 10: '9' } }
    const zones = [{ zone_id: 1 }, { zone_id: 2 }]
    const products = [{ product_id: 10 }, { product_id: 20 }]
    const paste = matrixPasteChanges('2,5\t3\n4\t', zones, products, 0, 0)
    const next = applyMatrixChanges(cells, paste.changes)

    expect(paste).toMatchObject({ rowCount: 2, columnCount: 2 })
    expect(next).toEqual({
      1: { 10: '2.5', 20: '3' },
      2: { 10: '4' },
      3: cells['3'],
    })
    expect(next['3']).toBe(cells['3'])
  })

  it('undoes the latest cell or batch edit and clear drops history', () => {
    let state = createMatrixDraftState()
    state = matrixDraftReducer(state, { type: 'set-cell', zoneId: 1, productId: 10, value: '2' })
    state = matrixDraftReducer(state, { type: 'merge-cells', changes: [{ zoneId: 1, productId: 20, value: '3' }] })
    expect(state.history).toHaveLength(2)

    state = matrixDraftReducer(state, { type: 'undo' })
    expect(state.cells).toEqual({ 1: { 10: '2' } })

    state = matrixDraftReducer(state, { type: 'clear' })
    expect(state).toEqual({ cells: {}, history: [] })
  })
})

describe('water matrix navigation', () => {
  it('moves with arrows and Enter while respecting boundaries', () => {
    const base = { rowIndex: 1, columnIndex: 1, rowCount: 3, columnCount: 3 }
    expect(nextMatrixPosition({ ...base, key: 'ArrowRight' })).toEqual({ rowIndex: 1, columnIndex: 2 })
    expect(nextMatrixPosition({ ...base, key: 'ArrowUp' })).toEqual({ rowIndex: 0, columnIndex: 1 })
    expect(nextMatrixPosition({ ...base, key: 'Enter' })).toEqual({ rowIndex: 2, columnIndex: 1 })
    expect(nextMatrixPosition({ ...base, key: 'Enter', shiftKey: true })).toEqual({ rowIndex: 0, columnIndex: 1 })
    expect(nextMatrixPosition({ ...base, rowIndex: 0, key: 'ArrowUp' })).toBeNull()
  })

  it('wraps Tab across rows and leaves the grid at its edges', () => {
    const base = { rowCount: 2, columnCount: 2 }
    expect(nextMatrixPosition({ ...base, rowIndex: 0, columnIndex: 1, key: 'Tab' })).toEqual({ rowIndex: 1, columnIndex: 0 })
    expect(nextMatrixPosition({ ...base, rowIndex: 1, columnIndex: 0, key: 'Tab', shiftKey: true })).toEqual({ rowIndex: 0, columnIndex: 1 })
    expect(nextMatrixPosition({ ...base, rowIndex: 1, columnIndex: 1, key: 'Tab' })).toBeNull()
  })
})

describe('water matrix virtualization', () => {
  it('keeps small matrices fully mounted', () => {
    expect(matrixVirtualWindow({ rowCount: 12, scrollTop: 400 })).toEqual({
      enabled: false,
      start: 0,
      end: 12,
      before: 0,
      after: 0,
    })
  })

  it('renders an overscanned window and preserves total spacer height', () => {
    const window = matrixVirtualWindow({
      rowCount: 100,
      scrollTop: 40 * 82,
      viewportHeight: 410,
      rowHeight: 82,
      overscan: 3,
    })

    expect(window).toEqual({
      enabled: true,
      start: 37,
      end: 48,
      before: 37 * 82,
      after: 52 * 82,
    })
    expect(window.before + (window.end - window.start) * 82 + window.after).toBe(100 * 82)
  })

  it('clamps an oversized scroll offset to the final row window', () => {
    const window = matrixVirtualWindow({ rowCount: 30, scrollTop: 999999, viewportHeight: 164, rowHeight: 82, overscan: 1 })
    expect(window).toMatchObject({ enabled: true, start: 26, end: 30, after: 0 })
  })
})
