import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  createTruckGateEntryAttachments,
  createTruckGateEntryPDFBuffer,
  createTruckGateEntryWorkbookBuffer,
  gateEntryDocumentData,
} from './gate-entry-documents.js'

const truck = {
  id: 73,
  arrival_date: '2027-03-10',
  arrival_start_time: '09:00',
  arrival_end_time: '11:00',
  driver_name: 'Ahmet Yılmaz',
  driver_tc: '12345678901',
  driver_phone: '05551112233',
  plate: '34 ABC 123',
  trailer_plate: '34 DRS 456',
  identity_type: 'tc',
  visit_company: 'AVS Küresel Gıda Tedarik ve Yönetim A.Ş.',
  host_person_name: 'Sercan Sucu',
  host_person_phone: '0539111344',
  entry_reason: 'SU AMAÇLI NAKLİYE',
  work_area: 'FPU KAMP ALANI',
  center_email: 'merkez@example.com',
}

describe('truck gate-entry documents', () => {
  it('maps the reference template columns without identity prefixes', () => {
    const data = gateEntryDocumentData(truck)
    expect(data.headers).toHaveLength(11)
    expect(data.values).toEqual([
      'Ahmet Yılmaz',
      '12345678901',
      '05551112233',
      '34 ABC 123\n34 DRS 456',
      'AVS Küresel Gıda Tedarik ve Yönetim A.Ş.',
      'Sercan Sucu',
      '0539111344',
      '10.03.2027',
      '09:00-11:00',
      'SU AMAÇLI NAKLİYE',
      'FPU KAMP ALANI',
    ])
  })

  it('creates a single-sheet, print-ready workbook with text-safe identity fields and template styling', async () => {
    const buffer = await createTruckGateEntryWorkbookBuffer(truck)
    expect(buffer.subarray(0, 2).toString()).toBe('PK')

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    expect(workbook.worksheets).toHaveLength(1)
    const sheet = workbook.getWorksheet('PERSONEL GÜNLÜK GİRİŞ')
    expect(sheet.getCell('B1').value).toBe('PERSONEL GÜNLÜK GİRİŞ ÇİZELGESİ')
    expect(sheet.getCell('B4').value).toBe('ADI SOYADI')
    expect(sheet.getCell('C4').value).toBe('T.C. KİMLİK / PASAPORT NUMARASI')
    expect(sheet.getCell('C5').value).toEqual({ richText: [{ text: '12345678901', font: undefined }] })
    expect(sheet.getCell('D5').value).toEqual({ richText: [{ text: '05551112233', font: undefined }] })
    expect(sheet.getCell('I5').value).toBe('10.03.2027')
    expect(sheet.getCell('B4').fill.fgColor.argb).toBe('FFDDEBF7')
    expect(sheet.pageSetup.orientation).toBe('landscape')
    expect(sheet.pageSetup.fitToWidth).toBe(1)
    expect(sheet.pageSetup.printArea).toBe('A1:M16')
  })

  it('creates one-page PDF and matching PDF/Excel mail attachments', async () => {
    const pdf = await createTruckGateEntryPDFBuffer(truck)
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(pdf.length).toBeGreaterThan(2000)
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)

    const attachments = await createTruckGateEntryAttachments(truck)
    expect(attachments.map(item => item.filename)).toEqual([
      'su-nakliye-personel-giris-2027-03-10-34-ABC-123.pdf',
      'su-nakliye-personel-giris-2027-03-10-34-ABC-123.xlsx',
    ])
    expect(attachments[0]).toMatchObject({ contentType: 'application/pdf' })
    expect(attachments[1]).toMatchObject({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  })
})
