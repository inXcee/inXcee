import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildOccupancyPrintHtml, buildOccupancyWorkbook, occupancyExportSummary, occupancyFilename } from './occupancyExport.js'

const ROWS = [
  { work_location_id: 1, name: 'OTC Yemekhane', site: 'OTC', count: 1, required: 0, empty: false, understaffed: false, is_default_area: false, present: [{ staff_id: 10, full_name: 'Ali Yilmaz', role_name: 'Ikramci', end_time: '17:00' }] },
  { work_location_id: 2, name: 'Isci Lokali', site: 'LOKAL', count: 0, required: 1, empty: true, understaffed: true, is_default_area: false, present: [] },
  { work_location_id: 3, name: 'Kamp Yemekhane', site: 'KAMP', count: 0, required: 0, empty: true, understaffed: false, is_default_area: false, present: [] },
  { work_location_id: null, name: 'Yemekhane', site: 'Yemekhane', count: 1, required: 0, empty: false, understaffed: false, is_default_area: true, present: [{ staff_id: 11, full_name: 'Veli Kaya', role_name: '', end_time: '' }] },
]

describe('occupancyExportSummary', () => {
  it('sahada/boş/eksik sayar (default alan boş sayımına girmez)', () => {
    expect(occupancyExportSummary(ROWS)).toEqual({ present: 2, empty: 2, understaffed: 1 })
  })
})

describe('buildOccupancyPrintHtml', () => {
  it('snapshot tablosunu, personeli ve eksik işaretini içerir', () => {
    const html = buildOccupancyPrintHtml({ date: '2026-07-19', time: '10:37', rows: ROWS })
    expect(html).toContain('CANLI LOKASYON DOLULUĞU')
    expect(html).toContain('2026-07-19')
    expect(html).toContain('10:37')
    expect(html).toContain('OTC Yemekhane')
    expect(html).toContain('Ali Yilmaz')
    expect(html).toContain('(→17:00)')
    expect(html).toContain('EKSİK') // Isci Lokali understaffed
    expect(html).toContain('Sahada')
  })

  it('HTML enjeksiyonunu escape eder', () => {
    const html = buildOccupancyPrintHtml({ date: 'x', time: 'y', rows: [{ name: '<script>bad</script>', site: 'OTC', count: 0, required: 0, empty: true, present: [] }] })
    expect(html).not.toContain('<script>bad</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('buildOccupancyWorkbook', () => {
  it('tek sayfa + başlık + eksik satırını kırmızı durumla yazar', () => {
    const { workbook, sheetName } = buildOccupancyWorkbook(ExcelJS, { date: '2026-07-19', time: '10:37', rows: ROWS })
    expect(sheetName).toBe('ŞU AN Doluluk')
    const ws = workbook.getWorksheet('ŞU AN Doluluk')
    expect(ws.getCell('A1').value).toBe('CANLI LOKASYON DOLULUĞU')
    const flat = []
    ws.eachRow(r => r.eachCell(c => flat.push(String(c.value ?? ''))))
    const text = flat.join(' | ')
    expect(text).toContain('Isci Lokali')
    expect(text).toContain('EKSİK')
    expect(text).toContain('Ali Yilmaz (→17:00)')
  })

  it('xlsx buffer üretir', async () => {
    const { workbook } = buildOccupancyWorkbook(ExcelJS, { date: '2026-07-19', time: '10:37', rows: ROWS })
    const buf = await workbook.xlsx.writeBuffer()
    expect(buf.byteLength).toBeGreaterThan(3000)
  })
})

describe('occupancyFilename', () => {
  it('güvenli dosya adı üretir', () => {
    expect(occupancyFilename('2026-07-19', '10:37', 'xlsx')).toBe('canli-doluluk-20260719-1037.xlsx')
  })
})
