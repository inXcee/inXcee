import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildCrossoverWorkbook } from './projectCrossoverExport.js'

const PAYLOAD = {
  rows: [
    { staff_id: 1, full_name: 'ALİ VELİ', work_date: '2026-08-03', roster_project_name: 'FPU', worked_project_name: 'Kamp Alanı', work_location_name: 'Kamp' },
    { staff_id: 1, full_name: 'ALİ VELİ', work_date: '2026-08-04', roster_project_name: 'FPU', worked_project_name: 'Kamp Alanı', work_location_name: 'Kamp' },
    { staff_id: 2, full_name: 'AYŞE YILMAZ', work_date: '2026-08-05', roster_project_name: 'Kamp Alanı', worked_project_name: 'FPU', work_location_name: 'Tas Bina' },
  ],
  setup: { unmapped_locations: 0, unmapped_names: [] },
}
const ARALIK = { from: '2026-08-03', to: '2026-08-09' }

function kur(payload = PAYLOAD) {
  return buildCrossoverWorkbook(ExcelJS, { ...ARALIK, payload })
}

describe('Çapraz çalışma Excel dökümü', () => {
  it('üç sayfa üretir: özet, yön, gün dökümü', () => {
    const { workbook } = kur()
    expect(workbook.worksheets.map(w => w.name)).toEqual(['Çapraz Çalışma', 'Yön Özeti', 'Gün Dökümü'])
  })

  it('kişi bazında toplar, gün sayısını yazar', () => {
    const { workbook, personCount } = kur()
    expect(personCount).toBe(2)
    const ws = workbook.getWorksheet('Çapraz Çalışma')
    expect(ws.getRow(4).getCell(2).value).toBe('ALİ VELİ')
    expect(ws.getRow(4).getCell(5).value).toBe(2)
    expect(ws.getRow(4).getCell(6).value).toBe('2026-08-03 – 2026-08-04')
  })

  it('gün dökümü ham satırların hepsini taşır', () => {
    const { workbook, dayCount } = kur()
    expect(dayCount).toBe(3)
    expect(workbook.getWorksheet('Gün Dökümü').rowCount).toBe(4) // başlık + 3
  })

  it('yön özeti proje→proje kişi ve gün verir', () => {
    const ws = kur().workbook.getWorksheet('Yön Özeti')
    expect(ws.getRow(2).values.slice(1)).toEqual(['FPU', 'Kamp Alanı', 1, 2])
  })

  // Kâğıdı okuyan kişi listenin eksik olabileceğini bilmeden maliyet aktarımı
  // yapmamalı — uyarı ekranda kalmayıp çıktıya da geçmeli.
  it('eksik eşleme uyarısı çıktının başlığına yazılır', () => {
    const { workbook } = kur({ rows: PAYLOAD.rows, setup: { unmapped_locations: 4, unmapped_names: ['Tas Bina'] } })
    const altBaslik = String(workbook.getWorksheet('Çapraz Çalışma').getCell('A2').value)
    expect(altBaslik).toMatch(/DİKKAT: 4 çalışma noktası projeye bağlı değil/)
  })

  it('tüm noktalar eşliyken uyarı yerine teyit yazar', () => {
    const altBaslik = String(kur().workbook.getWorksheet('Çapraz Çalışma').getCell('A2').value)
    expect(altBaslik).toMatch(/Tüm çalışma noktaları projeye bağlı/)
    expect(altBaslik).not.toMatch(/DİKKAT/)
  })

  it('boş sonuçta sebebi ayırt eder', () => {
    const kurulmamis = kur({ rows: [], setup: { unmapped_locations: 6 } })
    expect(String(kurulmamis.workbook.getWorksheet('Çapraz Çalışma').getRow(4).getCell(2).value))
      .toMatch(/Hesaplanamadı/)
    const bos = kur({ rows: [], setup: { unmapped_locations: 0 } })
    expect(String(bos.workbook.getWorksheet('Çapraz Çalışma').getRow(4).getCell(2).value))
      .toMatch(/Kadrosu dışında çalışan yok/)
  })
})
