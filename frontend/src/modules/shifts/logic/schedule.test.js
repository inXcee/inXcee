import { describe, it, expect } from 'vitest'
import { buildStaffGrid, computeWeekStats, parseShiftCell, parseScheduleSheet } from './schedule.js'

const SHIFT_DEFS = [
  { id: 10, name: 'Gündüz', color_class: 'bg-blue-400' },
  { id: 20, name: 'Akşam', color_class: 'bg-orange-400' },
  { id: 30, name: 'Gece', color_class: 'bg-indigo-600' },
]
const WEEK = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']

describe('buildStaffGrid', () => {
  it('schedule satırlarını staff_id başına gün haritasına indeksler', () => {
    const rows = [
      { staff_id: 1, full_name: 'Ali', dept_name: 'A', work_date: '2026-06-01', status: 'scheduled' },
      { staff_id: 1, full_name: 'Ali', dept_name: 'A', work_date: '2026-06-02', status: 'on_leave' },
    ]
    const grid = buildStaffGrid(rows, [], '')
    expect(grid).toHaveLength(1)
    expect(grid[0].days['2026-06-01'].status).toBe('scheduled')
    expect(grid[0].days['2026-06-02'].status).toBe('on_leave')
  })

  it('çizelgede olmayan aktif personeli boş gün haritasıyla ekler', () => {
    const rows = [{ staff_id: 1, full_name: 'Ali', dept_name: 'A', work_date: '2026-06-01', status: 'scheduled' }]
    const allStaff = [
      { id: 1, full_name: 'Ali', department_id: 5, dept_name: 'A' },
      { id: 2, full_name: 'Veli', department_id: 5, dept_name: 'A' },
    ]
    const grid = buildStaffGrid(rows, allStaff, '')
    expect(grid.map(p => p.id).sort()).toEqual([1, 2])
    expect(grid.find(p => p.id === 2).days).toEqual({})
  })

  it('deptFilter verilince farklı departmandaki personeli eklemez', () => {
    const allStaff = [
      { id: 1, full_name: 'Ali', department_id: 5, dept_name: 'A' },
      { id: 2, full_name: 'Veli', department_id: 9, dept_name: 'B' },
    ]
    const grid = buildStaffGrid([], allStaff, '5')
    expect(grid.map(p => p.id)).toEqual([1])
  })

  it('departman sonra ada göre Türkçe sıralar', () => {
    const allStaff = [
      { id: 1, full_name: 'Zeki', department_id: 1, dept_name: 'B' },
      { id: 2, full_name: 'Ahmet', department_id: 1, dept_name: 'A' },
      { id: 3, full_name: 'Çınar', department_id: 1, dept_name: 'A' },
    ]
    const grid = buildStaffGrid([], allStaff, '')
    expect(grid.map(p => p.full_name)).toEqual(['Ahmet', 'Çınar', 'Zeki'])
  })
})

describe('computeWeekStats', () => {
  it('günlük çalışan/izinli/boş sayar ve toplar', () => {
    const grid = [
      { id: 1, days: { '2026-06-01': { status: 'scheduled' }, '2026-06-02': { status: 'on_leave' } } },
      { id: 2, days: { '2026-06-01': { status: 'worked' } } },
    ]
    const stats = computeWeekStats(grid, WEEK)
    expect(stats.total).toBe(2)
    expect(stats.perDay[0].working).toHaveLength(2) // 06-01: ikisi de çalışıyor
    expect(stats.perDay[1].leave).toHaveLength(1)   // 06-02: 1 izinli
    expect(stats.perDay[1].empty).toHaveLength(1)   // 06-02: 1 boş (id 2)
    expect(stats.working).toBe(2)
    expect(stats.onLeave).toBe(1)
  })
})

describe('parseShiftCell', () => {
  it('boş/tire değerleri null döner', () => {
    expect(parseShiftCell('', SHIFT_DEFS)).toBeNull()
    expect(parseShiftCell('-', SHIFT_DEFS)).toBeNull()
    expect(parseShiftCell(null, SHIFT_DEFS)).toBeNull()
  })

  it('izin kodlarını on_leave döner', () => {
    expect(parseShiftCell('izin', SHIFT_DEFS)).toEqual({ shiftDefId: null, status: 'on_leave' })
    expect(parseShiftCell('i', SHIFT_DEFS)).toEqual({ shiftDefId: null, status: 'on_leave' })
    expect(parseShiftCell('off', SHIFT_DEFS)).toEqual({ shiftDefId: null, status: 'on_leave' })
  })

  it('1/G → 1.vardiya, 2/A → 2.vardiya, 3/Ge → 3.vardiya', () => {
    expect(parseShiftCell('1', SHIFT_DEFS)).toEqual({ shiftDefId: 10, status: 'scheduled' })
    expect(parseShiftCell('G', SHIFT_DEFS)).toEqual({ shiftDefId: 10, status: 'scheduled' })
    expect(parseShiftCell('A', SHIFT_DEFS)).toEqual({ shiftDefId: 20, status: 'scheduled' })
    expect(parseShiftCell('Ge', SHIFT_DEFS)).toEqual({ shiftDefId: 30, status: 'scheduled' })
  })

  it('sayısal indeks N → N.vardiya', () => {
    expect(parseShiftCell('2', SHIFT_DEFS)).toEqual({ shiftDefId: 20, status: 'scheduled' })
    expect(parseShiftCell('3', SHIFT_DEFS)).toEqual({ shiftDefId: 30, status: 'scheduled' })
  })

  it('aralık dışı sayı null döner', () => {
    expect(parseShiftCell('9', SHIFT_DEFS)).toBeNull()
  })
})

describe('parseScheduleSheet', () => {
  const ctx = { allStaff: [{ id: 1, full_name: 'Ali Veli', department_id: 5 }], shiftDefs: SHIFT_DEFS, weekDays: WEEK }

  it('boş sayfa hatası döner', () => {
    expect(parseScheduleSheet([], ctx)).toEqual({ error: 'Bos dosya' })
  })

  it('başlık satırı yoksa hata döner', () => {
    expect(parseScheduleSheet([['x'], ['y']], ctx)).toEqual({ error: 'Baslik satiri bulunamadi' })
  })

  it('isimli gün başlıklarıyla eşleşen personel için entries üretir', () => {
    const rows = [
      ['Ad', 'Pzt', 'Sal', 'Çar'],
      ['Ali Veli', '1', 'izin', '2'],
    ]
    const res = parseScheduleSheet(rows, ctx)
    expect(res.matched).toHaveLength(1)
    expect(res.unmatched).toHaveLength(0)
    expect(res.entries).toEqual([
      { staff_id: 1, dept_id: 5, work_date: '2026-06-01', shift_def_id: 10, status: 'scheduled' },
      { staff_id: 1, dept_id: 5, work_date: '2026-06-02', shift_def_id: null, status: 'on_leave' },
      { staff_id: 1, dept_id: 5, work_date: '2026-06-03', shift_def_id: 20, status: 'scheduled' },
    ])
  })

  it('eşleşmeyen ismi unmatched listesine koyar, entry üretmez', () => {
    const rows = [
      ['Ad', 'Pzt', 'Sal'],
      ['Bilinmeyen Kişi', '1', '-'],
    ]
    const res = parseScheduleSheet(rows, ctx)
    expect(res.matched).toHaveLength(0)
    expect(res.unmatched).toEqual([{ name: 'Bilinmeyen Kişi', dayEntries: [{ dayIdx: 0, date: '2026-06-01', shiftDefId: 10, status: 'scheduled' }] }])
    expect(res.entries).toHaveLength(0)
  })

  it('isimli gün sütunu yoksa isim sonrası sütunları sırayla eşler', () => {
    const rows = [
      ['Ad', 'K1', 'K2', 'K3'],
      ['Ali Veli', '1', '2', '3'],
    ]
    const res = parseScheduleSheet(rows, ctx)
    expect(res.entries.map(e => e.work_date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })
})
