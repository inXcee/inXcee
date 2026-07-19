import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildPhotoReportHtml, buildPhotoReportWorkbook, photoReportSummary, photoReportStatus } from './photoReportExport.js'

const ITEMS = [
  { id: 1, area: 'M1 Oda 101', block: 'M1', floor: 1, area_code: 'room', completed_at: '2026-07-19 09:00', photo_url: '/uploads/a.jpg', photo_count: 3, photo_categories: 'genel,hasar', scheduled_at: '2026-07-19 08:00', skipped: 0 },
  { id: 2, area: 'M1 Koridor', block: 'M1', floor: 1, area_code: 'corridor', completed_at: '2026-07-19 09:00', photo_url: null, photo_count: 0, photo_categories: null, scheduled_at: '2026-07-19 08:00', skipped: 0 },
  { id: 3, area: 'M2 Oda 201', block: 'M2', floor: 2, area_code: 'room', completed_at: null, photo_url: null, photo_count: 0, scheduled_at: '2026-07-19 08:00', skipped: 1, skip_reason: 'kilitli' },
]

describe('photoReportSummary / status', () => {
  it('görev/foto/fotoğraflı sayar', () => {
    expect(photoReportSummary(ITEMS)).toEqual({ tasks: 3, photos: 3, withPhoto: 1 })
  })
  it('durum etiketleri doğru', () => {
    expect(photoReportStatus(ITEMS[0])).toBe('Fotoğraflı')
    expect(photoReportStatus(ITEMS[1])).toBe('Foto eksik')
    expect(photoReportStatus(ITEMS[2])).toBe('Atlandı')
  })
})

describe('buildPhotoReportHtml', () => {
  it('kapak, sayı rozeti, kategori ve özet içerir; url mutlaklaşır', () => {
    const html = buildPhotoReportHtml({ items: ITEMS, subtitle: 'M1 · bugün', baseUrl: 'https://x.test' })
    expect(html).toContain('TEMİZLİK FOTOĞRAF KANIT RAPORU')
    expect(html).toContain('M1 · bugün')
    expect(html).toContain('src="https://x.test/uploads/a.jpg"')
    expect(html).toContain('📷 3')
    expect(html).toContain('Hasar')     // kategori etiketi
    expect(html).toContain('Görev:')
  })
  it('HTML enjeksiyonunu escape eder', () => {
    const html = buildPhotoReportHtml({ items: [{ area: '<b>x</b>', photo_count: 0 }] })
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})

describe('buildPhotoReportWorkbook', () => {
  it('başlık + satır yazar', () => {
    const { workbook } = buildPhotoReportWorkbook(ExcelJS, { items: ITEMS })
    const ws = workbook.getWorksheet('Foto Kanıt')
    expect(ws.getCell('A1').value).toBe('Alan')
    const flat = []
    ws.eachRow(r => r.eachCell(c => flat.push(String(c.value ?? ''))))
    const text = flat.join(' | ')
    expect(text).toContain('M1 Oda 101')
    expect(text).toContain('Fotoğraflı')
  })
})
