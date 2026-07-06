// Puantaj takvim grid'i — Excel benzeri etkileşimin saf mantığı.
// React'ten bağımsız tutulur ki jsdom olmadan birim test edilebilsin.

// Klavye kodu → PUANTAJ_ACTIONS id eşlemesi.
// TR klavye: 'İ'.toLowerCase() 'i̇' (combining dot) üretir — toLocaleLowerCase('tr') şart.
const KEY_ACTION_MAP = {
  n: 'worked',
  h: 'off',
  r: 'sick',
  u: 'unpaid',
  'ü': 'unpaid',
  i: 'annual',
  'ı': 'annual',
  y: 'absent',
  p: 'scheduled',
}

export function actionIdForKey(key) {
  if (typeof key !== 'string' || key.length > 2) return null
  const k = key.toLocaleLowerCase('tr')
  return KEY_ACTION_MAP[k] || null
}

// Anchor + focus hücresinden normalize dikdörtgen (her yönde seçim desteklenir).
export function normalizeRect(a, b) {
  return {
    r1: Math.min(a.row, b.row),
    r2: Math.max(a.row, b.row),
    d1: Math.min(a.day, b.day),
    d2: Math.max(a.day, b.day),
  }
}

export function cellsInRect(rect) {
  const cells = []
  for (let row = rect.r1; row <= rect.r2; row++) {
    for (let day = rect.d1; day <= rect.d2; day++) cells.push({ row, day })
  }
  return cells
}

export function isInRect(rect, row, day) {
  if (!rect) return false
  return row >= rect.r1 && row <= rect.r2 && day >= rect.d1 && day <= rect.d2
}

export function moveCell(cell, key, maxRow, maxDay) {
  let { row, day } = cell
  if (key === 'ArrowUp') row -= 1
  else if (key === 'ArrowDown') row += 1
  else if (key === 'ArrowLeft') day -= 1
  else if (key === 'ArrowRight') day += 1
  return {
    row: Math.max(0, Math.min(maxRow, row)),
    day: Math.max(1, Math.min(maxDay, day)),
  }
}

// Undo yığını — her batch bir işlem grubunun önceki hücre durumlarını taşır.
export function pushUndo(stack, batch, limit = 50) {
  if (!batch || batch.length === 0) return stack
  const next = [...stack, batch]
  return next.length > limit ? next.slice(next.length - limit) : next
}

// Gün kolonu alt toplamı: o gün kaç kişi çalıştı / haftalık izinli / izinli / devamsız.
export function summarizeColumn(entries) {
  const acc = { worked: 0, off: 0, leave: 0, absent: 0 }
  entries.forEach(e => {
    if (!e) return
    if (e.status === 'worked' || e.status === 'overtime') acc.worked++
    else if (e.status === 'off') acc.off++
    else if (e.status === 'on_leave') acc.leave++
    else if (e.status === 'absent') acc.absent++
  })
  return acc
}
