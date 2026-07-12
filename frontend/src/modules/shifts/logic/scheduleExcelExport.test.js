import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildScheduleExcelWorkbook } from './scheduleExcelExport.js'

const WEEK = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12']
const SHIFT_DEFS = [
  { id: 1, name: 'Gunduz', start_hour: 8, end_hour: 16, color_class: 'bg-blue-400' },
  { id: 2, name: 'Gece', start_hour: 20, end_hour: 8, color_class: 'bg-indigo-600' },
]

function shift(id = 1) {
  const def = SHIFT_DEFS.find(item => item.id === id)
  return {
    status: 'scheduled',
    shift_def_id: def.id,
    shift_name: def.name,
    start_hour: def.start_hour,
    end_hour: def.end_hour,
    shift_color: def.color_class,
  }
}

function buildWorkbook(overrides = {}) {
  const staffGrid = [
    {
      id: 10,
      full_name: 'Ali Yilmaz',
      dept_id: 1,
      dept_name: 'Teknik',
      position: 'OTC Yemekhane',
      gender: 'male',
      days: {
        [WEEK[0]]: shift(1),
        [WEEK[1]]: shift(1),
        [WEEK[2]]: { status: 'off' },
        [WEEK[3]]: shift(2),
        [WEEK[4]]: { status: 'absent', absent_reason: 'Gelmedi' },
      },
    },
    {
      id: 11,
      full_name: 'Ayse Kaya',
      dept_id: 2,
      dept_name: 'Guvenlik',
      position: 'FPU Lokal',
      gender: 'female',
      days: {
        [WEEK[0]]: shift(1),
        [WEEK[1]]: { status: 'on_leave', leave_type: 'annual' },
        [WEEK[2]]: shift(1),
        [WEEK[3]]: shift(1),
        [WEEK[4]]: shift(1),
        [WEEK[5]]: shift(1),
        [WEEK[6]]: shift(1),
      },
    },
  ]
  return buildScheduleExcelWorkbook(ExcelJS, {
    weekStart: WEEK[0],
    weekEnd: WEEK[6],
    weekDays: WEEK,
    staffGrid,
    visibleGrid: [],
    gridSearch: '',
    statusFilter: 'all',
    deptFilter: '',
    coverageMin: 2,
    shiftDefs: SHIFT_DEFS,
    ...overrides,
  })
}

describe('scheduleExcelExport - X3 workbook builder', () => {
  it('creates control, plan, operation, raw and department sheets', () => {
    const result = buildWorkbook()
    const names = result.workbook.worksheets.map(ws => ws.name)

    expect(result.sheetNames.control).toBe('Kontrol')
    expect(result.sheetNames.departments).toEqual(['Bolum - Guvenlik', 'Bolum - Teknik'])
    expect(names).toEqual(['Kontrol', 'Plan', 'Operasyon', 'Veri', 'Bolum - Guvenlik', 'Bolum - Teknik'])
  })

  it('writes control panel metrics and warning sections', () => {
    const result = buildWorkbook()
    const ws = result.workbook.getWorksheet('Kontrol')

    expect(ws.getCell('A1').value).toBe('VARDIYA KONTROL PANELI')
    expect(ws.getCell('A4').value).toBe('Personel')
    expect(ws.getCell('A5').value.result).toBe(2)
    expect(ws.getCell('A7').value).toBe('Tarih')
    expect(result.exportWarnings.length).toBeGreaterThan(0)
    expect(ws.getColumn(1).width).toBe(18)
  })

  it('builds department sheets with the filtered staff rows', () => {
    const result = buildWorkbook()
    const teknik = result.workbook.getWorksheet('Bolum - Teknik')
    const guvenlik = result.workbook.getWorksheet('Bolum - Guvenlik')

    expect(teknik.getCell('A1').value).toBe('BOLUM CIZELGESI - Teknik')
    expect(teknik.getCell('B8').value).toBe('Ali Yilmaz')
    expect(teknik.getCell('B9').value).toBeNull()
    expect(guvenlik.getCell('B8').value).toBe('Ayse Kaya')
  })

  it('keeps raw settings aware of the expanded sheet count', () => {
    const result = buildWorkbook()
    const raw = result.workbook.getWorksheet('Veri')
    const settingsRow = raw.getColumn(18).values.findIndex(value => value === 'Sayfa Modu')

    expect(settingsRow).toBeGreaterThan(0)
    expect(raw.getCell(settingsRow, 19).value).toBe('6 sayfa')
    expect(raw.getCell(settingsRow, 20).value).toContain('2 bolum sayfasi')
  })

  it('serializes the generated workbook to an xlsx buffer', async () => {
    const result = buildWorkbook()
    const buffer = await result.workbook.xlsx.writeBuffer()

    expect(buffer.byteLength).toBeGreaterThan(8000)
  })
})
