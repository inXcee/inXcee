import { describe, it, expect, vi, afterEach } from 'vitest'
import ExcelJS from 'exceljs'
import {
  COLORS,
  addMetric,
  argb,
  colLetter,
  fill,
  quoteSheet,
  saveWorkbook,
  setupSheet,
  setupTitle,
  sheetRange,
  styleHeaderRow,
} from './excelKit.js'

describe('excelKit - shared Excel helpers (X1)', () => {
  const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL)
    else delete URL.createObjectURL
    if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL)
    else delete URL.revokeObjectURL
  })

  it('builds stable argb, fill and sheet references', () => {
    expect(argb('3B82F6')).toBe('FF3B82F6')
    expect(argb('#dc2626')).toBe('FFDC2626')
    expect(fill(COLORS.green).fgColor.argb).toBe('FF22C55E')
    expect(colLetter(1)).toBe('A')
    expect(colLetter(27)).toBe('AA')
    expect(quoteSheet("Plan A")).toBe("'Plan A'")
    expect(quoteSheet("O'Brien")).toBe("'O''Brien'")
    expect(sheetRange('Plan A', '$A$1:$B$2')).toBe("'Plan A'!$A$1:$B$2")
  })

  it('applies printable sheet, title, header and metric styles', () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Plan')

    setupSheet(ws, COLORS.purple)
    setupTitle(ws, 'Baslik', 'Alt baslik', 6)
    ws.getRow(3).values = ['A', 'B', 'C']
    styleHeaderRow(ws.getRow(3))
    addMetric(ws, 1, 'Personel', 12, COLORS.blue)

    expect(ws.pageSetup.orientation).toBe('landscape')
    expect(ws.pageSetup.fitToWidth).toBe(1)
    expect(ws.getCell('A1').value).toBe('Baslik')
    expect(ws.getCell('A1').fill.fgColor.argb).toBe(argb(COLORS.ink))
    expect(ws.getCell('A3').fill.fgColor.argb).toBe(argb(COLORS.header))
    expect(ws.getCell('A4').value).toBe('Personel')
    expect(ws.getCell('A5').value).toBe(12)
  })

  it('downloads a workbook buffer and revokes the object url', () => {
    const createSpy = vi.fn(() => 'blob:test')
    const revokeSpy = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createSpy })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeSpy })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    saveWorkbook(new ArrayBuffer(8), 'test.xlsx')

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith('blob:test')
  })

  it('lets callers annotate download failures before rethrowing', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => { throw new Error('download blocked') }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })

    try {
      saveWorkbook(new ArrayBuffer(8), 'test.xlsx', {
        onError: (error) => {
          error.response = { data: { error: 'Puantaj föyü indirilemedi' } }
        },
      })
      throw new Error('saveWorkbook should have failed')
    } catch (error) {
      expect(error.message).toBe('download blocked')
      expect(error.response.data.error).toBe('Puantaj föyü indirilemedi')
    }
  })
})
