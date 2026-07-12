import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildPuantajFoyuWorkbook,
  summarizeFoyuRows,
  uniqueSheetName,
} from './puantajFoyuExcel.js'

function formulaResult(cell) {
  return cell.value && typeof cell.value === 'object' && 'result' in cell.value
    ? cell.value.result
    : cell.value
}

const sampleStaff = [
  { id: 1, full_name: 'Ali Yilmaz', dept_name: 'Teknik', department_id: 10, role_name: 'Usta' },
  { id: 2, full_name: 'Ayse Kaya', dept_name: 'Teknik', department_id: 10, role_name: 'Ikramci' },
  { id: 3, full_name: 'Mehmet Demir', dept_name: 'Guvenlik', department_id: 20, role_name: 'Gorevli' },
]

const sampleDays = {
  1: [
    { date: '2026-07-01', status: 'worked', shift_name: 'Sabah', start_hour: 6, end_hour: 15, work_location_name: 'OTC Lokal' },
    { date: '2026-07-02', status: 'off' },
    { date: '2026-07-03', status: 'on_leave', leave_type: 'annual' },
    { date: '2026-07-04', status: 'scheduled', shift_name: 'Aksam', start_hour: 15, end_hour: 23, work_location_name: 'Yemekhane' },
  ],
  2: [
    { date: '2026-07-01', status: 'worked', overtime_hours: 2 },
    { date: '2026-07-02', status: 'absent' },
    { date: '2026-07-03', status: 'worked' },
  ],
  3: [
    { date: '2026-07-01', status: 'on_leave', leave_type: 'sick' },
    { date: '2026-07-02', status: 'on_leave', leave_type: 'unpaid' },
    { date: '2026-07-03', status: 'worked', overtime_hours: 1 },
  ],
}

const sampleApproval = {
  period_approval: {
    period: '2026-07',
    status: 'submitted',
    note: 'Kontrol icin gonderildi',
    submitted_by_name: 'Vardiya Sorumlusu',
    submitted_at: '2026-07-31T12:00:00Z',
  },
  daily_approvals: [
    { work_date: '2026-07-01', status: 'approved', approved_by_name: 'Mudur' },
    { work_date: '2026-07-02', status: 'pending', submitted_by_name: 'Vardiya Sorumlusu' },
    { work_date: '2026-07-03', status: 'returned', note: 'Devamsizlik nedeni eksik' },
  ],
  events: [
    { id: 1, scope: 'period', period: '2026-07', action: 'submit', status: 'submitted', user_name: 'Vardiya Sorumlusu', created_at: '2026-07-31T12:00:00Z', note: 'Kontrol icin gonderildi' },
  ],
}

function buildSampleWorkbook() {
  return buildPuantajFoyuWorkbook(ExcelJS, {
    staffRows: sampleStaff,
    daysByStaff: sampleDays,
    holidays: [{ date: '2026-07-03', name: 'Test Resmi Tatil' }],
    month: '2026-07',
    monthLabel: 'TEMMUZ 2026',
    deptName: 'Tum Departmanlar',
    companyName: 'Test Kampus',
    approval: sampleApproval,
  })
}

describe('puantajFoyuExcel workbook builder', () => {
  it('creates combined, department, control and approval sheets', () => {
    const result = buildSampleWorkbook()
    const names = result.workbook.worksheets.map(ws => ws.name)

    expect(result.sheetNames.main).toBe('Puantaj')
    expect(result.sheetNames.departments).toHaveLength(2)
    expect(result.sheetNames.approval).toBe('Onay Takibi')
    expect(names).toContain('Onay Takibi')
    expect(names.at(-1)).toBe('Vardiya Detay')
    expect(names).toHaveLength(8)
  })

  it('summarizes department totals correctly', () => {
    const result = buildSampleWorkbook()
    const summaries = summarizeFoyuRows(result.rows)
    const teknik = summaries.find(row => row.dept === 'Teknik')
    const guvenlik = summaries.find(row => row.dept === 'Guvenlik')

    expect(teknik.staffCount).toBe(2)
    expect(teknik.totals.worked).toBe(3)
    expect(teknik.totals.off).toBe(1)
    expect(teknik.totals.annual).toBe(1)
    expect(teknik.totals.absent).toBe(1)
    expect(teknik.totals.fmHours).toBe(2)
    expect(teknik.totals.holidayWorked).toBe(1)

    expect(guvenlik.staffCount).toBe(1)
    expect(guvenlik.totals.worked).toBe(1)
    expect(guvenlik.totals.sick).toBe(1)
    expect(guvenlik.totals.unpaid).toBe(1)
    expect(guvenlik.totals.fmHours).toBe(1)
    expect(guvenlik.totals.holidayWorked).toBe(1)
  })

  it('writes formula-backed summary cells with approval metrics', () => {
    const result = buildSampleWorkbook()
    const ws = result.workbook.getWorksheet(result.sheetNames.summary)
    const totalRowNo = result.sheetInfo.summary.lastRow

    expect(ws.getCell('A7').value).toBe('DEPARTMAN')
    expect(formulaResult(ws.getCell(`B${totalRowNo}`))).toBe(3)
    expect(formulaResult(ws.getCell(`C${totalRowNo}`))).toBe(4)
    expect(formulaResult(ws.getCell(`J${totalRowNo}`))).toBe(3)
    expect(String(ws.getCell(`C${totalRowNo}`).value.formula)).toContain('SUM(C8:C9)')
    expect(ws.getCell('I4').value).toBe('ONAYLI GUN')
    expect(ws.getCell('K5').value).toBe('Kontrolde')
  })

  it('adds daily control formulas and shift detail sheets', () => {
    const result = buildSampleWorkbook()
    const daily = result.workbook.getWorksheet(result.sheetNames.daily)
    const closing = result.workbook.getWorksheet(result.sheetNames.closing)
    const detail = result.workbook.getWorksheet(result.sheetNames.detail)

    expect(daily.getCell('A7').value).toBeTruthy()
    expect(formulaResult(daily.getCell('C8'))).toBe(2)
    expect(String(daily.getCell('C8').value.formula)).toContain('COUNTIF')
    expect(closing.getCell('K8').value).toContain('planl')
    expect(detail.getCell('H8').value).toBe('OTC Lokal')
  })

  it('adds approval tracking sheet with period, daily and event rows', () => {
    const result = buildSampleWorkbook()
    const approval = result.workbook.getWorksheet(result.sheetNames.approval)

    expect(approval.getCell('A7').value).toBe('AY DURUMU')
    expect(approval.getCell('A8').value).toBe('Kontrolde')
    expect(approval.getCell('C12').value).toBe('Onaylandi')
    expect(approval.getCell('C13').value).toBe('Bekliyor')
    expect(approval.getCell('C14').value).toBe('Geri dondu')
    expect(approval.getCell('A45').value).toBe('ISLEM GECMISI')
    expect(approval.getCell('D47').value).toBe('submit')
  })

  it('uses safe three-part signature merges across the full printable width', () => {
    const result = buildSampleWorkbook()
    const ws = result.workbook.getWorksheet(result.sheetNames.main)
    const { signatureRow, lastCol } = result.sheetInfo.main
    const middleStart = Math.floor(lastCol / 3) + 1
    const lastStart = Math.floor((2 * lastCol) / 3) + 1

    expect(ws.getCell(signatureRow, 1).value).toContain('D')
    expect(ws.getCell(signatureRow, middleStart).value).toContain('KONTROL EDEN')
    expect(ws.getCell(signatureRow, lastStart).value).toContain('ONAYLAYAN')
    expect(ws.getCell(signatureRow, 1).isMerged).toBe(true)
    expect(ws.getCell(signatureRow, lastCol).isMerged).toBe(true)
    expect(ws.pageSetup.printArea).toBe(`A1:AQ${signatureRow}`)
  })

  it('keeps sheet names unique and Excel-safe', () => {
    const used = new Set()
    expect(uniqueSheetName('Puantaj', used)).toBe('Puantaj')
    expect(uniqueSheetName('Puantaj', used)).toBe('Puantaj (2)')
    expect(uniqueSheetName('Cok/Uzun*Departman?Adi:Deneme[1]', used)).toBe('Cok Uzun Departman Adi Deneme 1')
  })

  it('handles empty exports without broken summary formulas', () => {
    const result = buildPuantajFoyuWorkbook(ExcelJS, {
      staffRows: [],
      daysByStaff: {},
      holidays: [],
      month: '2026-07',
      monthLabel: 'TEMMUZ 2026',
      deptName: 'Tum Departmanlar',
      companyName: 'Test Kampus',
    })
    const ws = result.workbook.getWorksheet(result.sheetNames.summary)

    expect(result.sheetNames.departments).toHaveLength(0)
    expect(result.sheetNames.approval).toBe('Onay Takibi')
    expect(ws.getCell('A8').value).toBe('GENEL TOPLAM')
    expect(ws.getCell('B8').value).toBe(0)
    expect(ws.getCell('C8').value).toBe(0)
  })

  it('serializes the generated workbook to an xlsx buffer', async () => {
    const result = buildSampleWorkbook()
    const buffer = await result.workbook.xlsx.writeBuffer()

    expect(buffer.byteLength).toBeGreaterThan(5000)
  })
})
