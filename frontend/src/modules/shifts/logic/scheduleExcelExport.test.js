import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildScheduleExcelWorkbook } from './scheduleExcelExport.js'

const WEEK = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12']
const SHIFT_DEFS = [
  { id: 1, name: 'Gunduz', start_hour: 8, end_hour: 16, color_class: 'bg-blue-400' },
  { id: 2, name: 'Gece', start_hour: 20, end_hour: 8, color_class: 'bg-indigo-600' },
]

function shift(id = 1, extra = {}) {
  const def = SHIFT_DEFS.find(item => item.id === id)
  return {
    status: 'scheduled',
    shift_def_id: def.id,
    shift_name: def.name,
    start_hour: def.start_hour,
    end_hour: def.end_hour,
    shift_color: def.color_class,
    ...extra,
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
      role_name: 'Ikramci',
      gender: 'male',
      days: {
        [WEEK[0]]: shift(1, { work_location_name: 'OTC Yemekhane' }),
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
      role_name: 'Meydanci',
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
    expect(teknik.getCell('D8').value).toBe('Ikramci')
    expect(teknik.getCell('F8').value).toContain('OTC Yemekhane')
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
    expect(raw.getCell('P4').value).toBe('Ikramci')
    expect(raw.getCell('Q4').value).toBe('OTC Yemekhane')
  })

  it('serializes the generated workbook to an xlsx buffer', async () => {
    const result = buildWorkbook()
    const buffer = await result.workbook.xlsx.writeBuffer()

    expect(buffer.byteLength).toBeGreaterThan(8000)
  })

  it('writes every split-shift segment into the schedule cell', () => {
    const cell = shift(1, { segments: [
      { id: 1, start_time: '08:00', end_time: '12:00', work_location_name: 'OTC Lokal', role_name: 'Ikramci', status: 'planned' },
      { id: 2, start_time: '13:00', end_time: '17:00', work_location_name: 'Kamp Yemekhane', role_name: 'Meydanci', status: 'planned' },
    ] })
    const result = buildWorkbook({ staffGrid: [{ id: 20, full_name: 'Parcali Personel', dept_name: 'Teknik', role_name: 'Ikramci', days: { [WEEK[0]]: cell } }] })
    const teknik = result.workbook.getWorksheet('Bolum - Teknik')
    expect(teknik.getCell('F8').value).toContain('08:00-12:00 OTC Lokal')
    expect(teknik.getCell('F8').value).toContain('13:00-17:00 Kamp Yemekhane')
  })

  it('adds print-ready daily signature sheets for the selected days', () => {
    // WEEK[4]: Ali devamsız → imza-alınmayacak bölümünde görünür
    const result = buildWorkbook({ signatureDates: [WEEK[4]], signatureOptions: { showLocationAndRole: true, showSummary: true, revision: '3' } })
    expect(result.sheetNames.signatures).toHaveLength(1)
    const ws = result.workbook.getWorksheet(result.sheetNames.signatures[0])
    expect(ws).toBeTruthy()
    expect(ws.name.startsWith('İmza -')).toBe(true)
    expect(ws.pageSetup.orientation).toBe('portrait')
    const flat = []
    ws.eachRow(row => row.eachCell(cell => flat.push(String(cell.value?.result ?? cell.value ?? ''))))
    const text = flat.join(' | ')
    expect(text).toContain('Fiili Vardiya / Durum')
    expect(text).toContain('İMZA ALINMAYACAK PERSONEL')
    expect(text).toContain('Onay (Vardiya Amiri):')
  })

  it('adds entry/exit signature columns when double signature is on', () => {
    const result = buildWorkbook({ signatureDates: [WEEK[0]], signatureOptions: { doubleSignature: true } })
    const ws = result.workbook.getWorksheet(result.sheetNames.signatures[0])
    const flat = []
    ws.eachRow(row => row.eachCell(cell => flat.push(String(cell.value ?? ''))))
    expect(flat).toContain('Giriş İmza')
    expect(flat).toContain('Çıkış İmza')
  })
})
