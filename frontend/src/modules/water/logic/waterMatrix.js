const HISTORY_LIMIT = 50

export const MATRIX_ROW_HEIGHT = 82
export const MATRIX_VIRTUALIZATION_THRESHOLD = 24

export const createMatrixDraftState = () => ({ cells: {}, history: [] })

const cleanValue = (value) => String(value ?? '').trim()

export function updateMatrixCell(cells, zoneId, productId, value) {
  const zoneKey = String(zoneId)
  const productKey = String(productId)
  const currentRow = cells[zoneKey] || {}
  const nextValue = cleanValue(value)

  if ((currentRow[productKey] || '') === nextValue) return cells
  if (!nextValue && !(productKey in currentRow)) return cells

  const nextRow = { ...currentRow }
  if (nextValue) nextRow[productKey] = nextValue
  else delete nextRow[productKey]

  const nextCells = { ...cells }
  if (Object.keys(nextRow).length) nextCells[zoneKey] = nextRow
  else delete nextCells[zoneKey]
  return nextCells
}

export function applyMatrixChanges(cells, changes) {
  let next = cells
  changes.forEach(({ zoneId, productId, value }) => {
    next = updateMatrixCell(next, zoneId, productId, value)
  })
  return next
}

export function matrixPasteChanges(text, zoneRows, columns, startRow, startColumn) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').trimEnd()
  if (!normalized) return { changes: [], rowCount: 0, columnCount: 0 }

  const rows = normalized.split('\n').map(row => row.split('\t'))
  const changes = []
  let columnCount = 0

  rows.forEach((values, rowOffset) => {
    const zone = zoneRows[startRow + rowOffset]
    if (!zone) return
    columnCount = Math.max(columnCount, values.length)
    values.forEach((raw, columnOffset) => {
      const product = columns[startColumn + columnOffset]
      if (!product) return
      changes.push({
        zoneId: zone.zone_id,
        productId: product.product_id,
        value: cleanValue(raw).replace(',', '.'),
      })
    })
  })

  return { changes, rowCount: rows.length, columnCount }
}

function withHistory(state, nextCells) {
  if (nextCells === state.cells) return state
  return {
    cells: nextCells,
    history: [...state.history.slice(-(HISTORY_LIMIT - 1)), state.cells],
  }
}

export function matrixDraftReducer(state, action) {
  if (action.type === 'set-cell') {
    return withHistory(state, updateMatrixCell(state.cells, action.zoneId, action.productId, action.value))
  }
  if (action.type === 'merge-cells') {
    return withHistory(state, applyMatrixChanges(state.cells, action.changes || []))
  }
  if (action.type === 'undo') {
    if (!state.history.length) return state
    return {
      cells: state.history[state.history.length - 1],
      history: state.history.slice(0, -1),
    }
  }
  if (action.type === 'clear') return createMatrixDraftState()
  return state
}

export function nextMatrixPosition({ key, rowIndex, columnIndex, rowCount, columnCount, shiftKey = false }) {
  if (rowCount < 1 || columnCount < 1) return null

  let nextRow = rowIndex
  let nextColumn = columnIndex

  if (key === 'Tab') {
    const flatIndex = rowIndex * columnCount + columnIndex + (shiftKey ? -1 : 1)
    if (flatIndex < 0 || flatIndex >= rowCount * columnCount) return null
    return { rowIndex: Math.floor(flatIndex / columnCount), columnIndex: flatIndex % columnCount }
  }
  if (key === 'Enter') nextRow += shiftKey ? -1 : 1
  else if (key === 'ArrowUp') nextRow -= 1
  else if (key === 'ArrowDown') nextRow += 1
  else if (key === 'ArrowLeft') nextColumn -= 1
  else if (key === 'ArrowRight') nextColumn += 1
  else return null

  if (nextRow < 0 || nextRow >= rowCount || nextColumn < 0 || nextColumn >= columnCount) return null
  return { rowIndex: nextRow, columnIndex: nextColumn }
}

export function matrixVirtualWindow({
  rowCount,
  scrollTop = 0,
  viewportHeight = 640,
  rowHeight = MATRIX_ROW_HEIGHT,
  overscan = 4,
  threshold = MATRIX_VIRTUALIZATION_THRESHOLD,
}) {
  const count = Math.max(0, Math.trunc(Number(rowCount) || 0))
  if (count <= threshold) {
    return { enabled: false, start: 0, end: count, before: 0, after: 0 }
  }

  const height = Math.max(1, Number(rowHeight) || MATRIX_ROW_HEIGHT)
  const view = Math.max(height, Number(viewportHeight) || 640)
  const buffer = Math.max(0, Math.trunc(Number(overscan) || 0))
  const firstVisible = Math.min(count - 1, Math.max(0, Math.floor(Math.max(0, Number(scrollTop) || 0) / height)))
  const visibleCount = Math.max(1, Math.ceil(view / height))
  const windowSize = Math.min(count, visibleCount + buffer * 2)
  let start = Math.max(0, firstVisible - buffer)
  let end = Math.min(count, start + windowSize)

  if (end === count) start = Math.max(0, end - windowSize)
  end = Math.min(count, start + windowSize)

  return {
    enabled: true,
    start,
    end,
    before: start * height,
    after: (count - end) * height,
  }
}
