import { describe, it, expect } from 'vitest'
import {
  actionIdForKey,
  normalizeRect,
  cellsInRect,
  isInRect,
  moveCell,
  pushUndo,
  summarizeColumn,
} from './puantajGrid.js'

describe('actionIdForKey', () => {
  it('temel kodları eşler', () => {
    expect(actionIdForKey('n')).toBe('worked')
    expect(actionIdForKey('h')).toBe('off')
    expect(actionIdForKey('r')).toBe('sick')
    expect(actionIdForKey('y')).toBe('absent')
    expect(actionIdForKey('p')).toBe('scheduled')
  })

  it('büyük harf ve Türkçe varyantları eşler', () => {
    expect(actionIdForKey('N')).toBe('worked')
    expect(actionIdForKey('Ü')).toBe('unpaid')
    expect(actionIdForKey('u')).toBe('unpaid')
    expect(actionIdForKey('İ')).toBe('annual') // TR büyük İ → toLocaleLowerCase('tr')
    expect(actionIdForKey('i')).toBe('annual')
    expect(actionIdForKey('ı')).toBe('annual')
    expect(actionIdForKey('I')).toBe('annual') // TR klavyede I → ı
  })

  it('eşleşmeyen tuşlarda null döner', () => {
    expect(actionIdForKey('x')).toBe(null)
    expect(actionIdForKey('Enter')).toBe(null)
    expect(actionIdForKey('ArrowUp')).toBe(null)
  })
})

describe('normalizeRect / cellsInRect / isInRect', () => {
  it('ters yönlü seçimi normalize eder', () => {
    const rect = normalizeRect({ row: 5, day: 20 }, { row: 2, day: 3 })
    expect(rect).toEqual({ r1: 2, r2: 5, d1: 3, d2: 20 })
  })

  it('tek hücrelik seçim', () => {
    const rect = normalizeRect({ row: 1, day: 4 }, { row: 1, day: 4 })
    expect(cellsInRect(rect)).toEqual([{ row: 1, day: 4 }])
  })

  it('dikdörtgendeki tüm hücreleri üretir', () => {
    const rect = normalizeRect({ row: 0, day: 1 }, { row: 1, day: 3 })
    expect(cellsInRect(rect)).toHaveLength(6)
    expect(cellsInRect(rect)).toContainEqual({ row: 1, day: 2 })
  })

  it('isInRect sınırları dahil eder', () => {
    const rect = normalizeRect({ row: 1, day: 5 }, { row: 3, day: 10 })
    expect(isInRect(rect, 1, 5)).toBe(true)
    expect(isInRect(rect, 3, 10)).toBe(true)
    expect(isInRect(rect, 2, 7)).toBe(true)
    expect(isInRect(rect, 0, 7)).toBe(false)
    expect(isInRect(rect, 2, 11)).toBe(false)
    expect(isInRect(null, 2, 7)).toBe(false)
  })
})

describe('moveCell', () => {
  it('ok tuşlarıyla hareket eder', () => {
    expect(moveCell({ row: 2, day: 10 }, 'ArrowUp', 5, 31)).toEqual({ row: 1, day: 10 })
    expect(moveCell({ row: 2, day: 10 }, 'ArrowDown', 5, 31)).toEqual({ row: 3, day: 10 })
    expect(moveCell({ row: 2, day: 10 }, 'ArrowLeft', 5, 31)).toEqual({ row: 2, day: 9 })
    expect(moveCell({ row: 2, day: 10 }, 'ArrowRight', 5, 31)).toEqual({ row: 2, day: 11 })
  })

  it('sınırlarda kalır (clamp)', () => {
    expect(moveCell({ row: 0, day: 1 }, 'ArrowUp', 5, 31)).toEqual({ row: 0, day: 1 })
    expect(moveCell({ row: 0, day: 1 }, 'ArrowLeft', 5, 31)).toEqual({ row: 0, day: 1 })
    expect(moveCell({ row: 5, day: 31 }, 'ArrowDown', 5, 31)).toEqual({ row: 5, day: 31 })
    expect(moveCell({ row: 5, day: 31 }, 'ArrowRight', 5, 31)).toEqual({ row: 5, day: 31 })
  })
})

describe('pushUndo', () => {
  it('batch ekler ve limiti aşınca en eskiyi düşürür', () => {
    let stack = []
    for (let i = 0; i < 55; i++) stack = pushUndo(stack, [{ id: i }], 50)
    expect(stack).toHaveLength(50)
    expect(stack[0][0].id).toBe(5) // ilk 5 düştü
    expect(stack[49][0].id).toBe(54)
  })

  it('boş batch eklemez', () => {
    expect(pushUndo([], [], 50)).toHaveLength(0)
  })
})

describe('summarizeColumn', () => {
  it('gün kolonundaki durumları sayar', () => {
    const entries = [
      { status: 'worked' },
      { status: 'overtime' },
      { status: 'off' },
      { status: 'on_leave', leave_type: 'annual' },
      { status: 'absent' },
      { status: 'scheduled' },
      undefined, // kayıt yok
      { status: 'no_record' },
    ]
    expect(summarizeColumn(entries)).toEqual({ worked: 2, off: 1, leave: 1, absent: 1 })
  })
})
