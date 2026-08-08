import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import {
  PERSONNEL_DOSSIER_EXCEL_SHEETS,
  PERSONNEL_TRACKING_EXCEL_SHEETS,
  buildPersonnelDossierWorkbook,
  buildPersonnelTrackingWorkbook,
  loadPersonnelTrackingExportData,
  personnelDossierFilename,
  personnelTrackingFilename,
  safeExcelText,
} from './personnelTrackingExcel.js'

const PEOPLE = [
  {
    id: 54, full_name: '=FORMULA', project_name: 'FPU', department_name: 'Bulaşıkhane',
    employment_status: 'active', hire_date: '2024-01-15', last_event_type: 'shift_changed', last_event_at: '2026-08-07 12:00:00',
    annual_leave_days: 4, sick_leave_days: 2, sick_occurrences: 1, overtime_hours: 12.5,
    absent_days: 1, shift_changes: 3, permanent_movements: 1, open_alerts: 2,
  },
  {
    id: 99, full_name: 'Ali Rıza Çorban', project_name: 'Kampüs', department_name: 'Mutfak',
    employment_status: 'exited', hire_date: '2023-03-01', exit_date: '2026-08-01', exit_type: 'project_end',
    annual_leave_days: 0, sick_leave_days: 0, sick_occurrences: 0, overtime_hours: 0,
    absent_days: 0, shift_changes: 0, permanent_movements: 0, open_alerts: 0,
  },
]

const EVENTS = [
  { id: 1, staff_id: 54, full_name: '=FORMULA', event_type: 'assignment_changed', effective_at: '2026-08-01 08:00:00', before: { project: 'A' }, after: { project: 'FPU' }, reason: '@gerekçe', actor_name: 'Müdür', created_at: '2026-08-01 09:00:00' },
  { id: 2, staff_id: 54, full_name: '=FORMULA', event_type: 'temporary_project_work', effective_at: '2026-08-02 08:00:00', before: null, after: { project: 'Kampüs' }, reason: 'Destek', actor_name: 'Vardiya', created_at: '2026-08-02 09:00:00' },
  { id: 3, staff_id: 54, full_name: '=FORMULA', event_type: 'shift_changed', effective_at: '2026-08-03 08:00:00', before: { shift: 'Gündüz' }, after: { shift: 'Gece' }, reason: 'Takip', actor_name: 'Vardiya', created_at: '2026-08-03 09:00:00' },
]

const ALERTS = [
  { id: 8, staff_id: 54, full_name: '=FORMULA', severity: 'critical', status: 'open', title: 'Mesai eşiği', message: '+45 saat', assigned_user_name: 'Müdür', due_at: '2026-08-10 17:00:00', project_name: 'FPU', department_name: 'Bulaşıkhane' },
]

function trackingOptions() {
  return {
    overview: {
      period: { from: '2026-08-01', to: '2026-08-31' },
      kpis: { active: 1, exited: 1, offboarding: 0, hired: 0, permanent_movements: 1, temporary_project_work: 1, shift_changes: 3, annual_leave_days: 4, sick_leave_days: 2, other_leave_days: 0, overtime_hours: 12.5, absent_days: 1, open_alerts: 2, overdue_alerts: 1, critical_alerts: 1 },
    },
    people: PEOPLE, events: EVENTS, alerts: ALERTS,
    details: {
      leaves: [{ full_name: '=FORMULA', project_name: 'FPU', department_name: 'Bulaşıkhane', leave_type: 'sick', start_date: '2026-08-05', end_date: '2026-08-06', total_days: 2, status: 'approved', reason: 'Rapor' }],
      overtime: [{ full_name: '=FORMULA', project_name: 'FPU', department_name: 'Bulaşıkhane', work_date: '2026-08-07', hours: 12.5, reason: 'Yoğunluk', approved_by: 1, approved_by_name: 'Müdür' }],
      temporary_work: [{ work_date: '2026-08-02', full_name: '=FORMULA', permanent_project_name: 'FPU', work_project_name: 'Kampüs', department_name: 'Bulaşıkhane', work_location_name: 'Mutfak', shift_name: 'Gündüz', status: 'worked' }],
    },
    filterLabels: ['Proje: FPU', 'Departman: Bulaşıkhane'],
    generatedAt: new Date('2026-08-08T10:00:00+03:00'), generatedBy: 'Kampüs Müdürü',
  }
}

describe('personnelTrackingExcel', () => {
  it('protects every user controlled text cell from formula injection', () => {
    expect(safeExcelText('=1+1')).toBe("'=1+1")
    expect(safeExcelText('+45 saat')).toBe("'+45 saat")
    expect(safeExcelText('@gerekçe')).toBe("'@gerekçe")
    expect(safeExcelText('Normal')).toBe('Normal')
  })

  it('loads every event page and limits alerts to the filtered personnel set', async () => {
    const api = { get: vi.fn((url, { params }) => {
      if (url.endsWith('/overview')) return Promise.resolve({ data: { period: { from: params.from, to: params.to } } })
      if (url.endsWith('/people')) return Promise.resolve({ data: { items: [PEOPLE[0]] } })
      if (url.endsWith('/events') && params.page === 1) return Promise.resolve({ data: { items: EVENTS.slice(0, 1), total: 201 } })
      if (url.endsWith('/events') && params.page === 2) return Promise.resolve({ data: { items: EVENTS.slice(1) } })
      if (url.endsWith('/alerts')) return Promise.resolve({ data: { items: [...ALERTS, { id: 9, staff_id: 999, status: 'open' }] } })
      if (url.endsWith('/export-details')) return Promise.resolve({ data: { leaves: [], overtime: [], temporary_work: [] } })
      throw new Error(`Unexpected request: ${url}`)
    }) }
    const result = await loadPersonnelTrackingExportData(api, { from: '2026-08-01', to: '2026-08-31', project_id: '3' })
    expect(api.get).toHaveBeenCalledTimes(6)
    expect(result.events).toHaveLength(3)
    expect(result.alerts.map(item => item.id)).toEqual([8])
    expect(api.get).toHaveBeenCalledWith('/personnel/tracking/people', { params: expect.objectContaining({ project_id: '3', limit: 500 }) })
  })

  it('builds the filtered nine-sheet management workbook with live formulas', async () => {
    const workbook = buildPersonnelTrackingWorkbook(ExcelJS, trackingOptions())
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(PERSONNEL_TRACKING_EXCEL_SHEETS)
    expect(workbook.getWorksheet('Yönetim Özeti').getCell('A1').value).toContain('YÖNETİM ÖZETİ')
    expect(workbook.getWorksheet('Yönetim Özeti').getCell('A5').value).toMatchObject({ formula: expect.stringContaining('COUNTIF'), result: 1 })
    expect(workbook.getWorksheet('Personel Metrikleri').getCell('B5').value).toBe("'=FORMULA")
    expect(workbook.getWorksheet('Kalıcı Transferler').getCell('G5').value).toBe("'@gerekçe")
    expect(workbook.getWorksheet('Açık Aksiyonlar').getCell('F5').value).toBe("'+45 saat")
    workbook.eachSheet(sheet => {
      expect(sheet.pageSetup.orientation).toBe('landscape')
      expect(sheet.pageSetup.fitToWidth).toBe(1)
      expect(sheet.pageSetup.printArea).toMatch(/^A1:/)
    })
    const buffer = await workbook.xlsx.writeBuffer()
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(buffer)
    expect(buffer.byteLength).toBeGreaterThan(18_000)
    expect(reopened.worksheets.map(sheet => sheet.name)).toEqual(PERSONNEL_TRACKING_EXCEL_SHEETS)
    expect(reopened.getWorksheet('Yönetim Özeti').getCell('A5').value.formula).toContain('COUNTIF')
  })

  it('builds a complete six-sheet person dossier and preserves movement history', async () => {
    const tracking = {
      period: { from: '2024-01-15', to: '2026-08-08' }, staff: PEOPLE[0],
      summary: { scheduled_days: 1, worked_days: 1, approved_leave_days: 2, sick_days: 2, overtime_hours: 4.5, absent_days: 0, shift_changes: 1, permanent_movements: 1 },
      shifts: [{ work_date: '2026-08-01', shift_name: 'Gündüz', status: 'worked', work_project_name: 'FPU', work_location_name: 'Mutfak' }],
      leaves: [{ leave_type: 'sick', start_date: '2026-08-02', end_date: '2026-08-03', total_days: 2, status: 'approved', reason: 'Rapor' }],
      overtime: [{ work_date: '2026-08-04', hours: 4.5, status: 'approved', reason: 'Yoğunluk' }],
      assignments: [{ effective_from: '2024-01-15', project_name: 'FPU', department_name: 'Bulaşıkhane', role_name: 'Personel', work_location_name: 'Mutfak' }],
      events: EVENTS,
    }
    const workbook = buildPersonnelDossierWorkbook(ExcelJS, { dossier: { person: PEOPLE[0] }, tracking, staffId: 54, generatedBy: 'Müdür' })
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(PERSONNEL_DOSSIER_EXCEL_SHEETS)
    expect(workbook.getWorksheet('Personel Özeti').getCell('A1').value).toContain('TAM ÇALIŞMA DOSYASI')
    expect(workbook.getWorksheet('Personel Özeti').getCell('A12').value).toMatchObject({ formula: expect.stringContaining('COUNTIF'), result: 1 })
    expect(workbook.getWorksheet('Hareket Günlüğü').rowCount).toBe(7)
    const buffer = await workbook.xlsx.writeBuffer()
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(buffer)
    expect(reopened.worksheets.map(sheet => sheet.name)).toEqual(PERSONNEL_DOSSIER_EXCEL_SHEETS)
  })

  it('uses stable, filesystem-safe filenames', () => {
    expect(personnelTrackingFilename('2026-08-01', '2026-08-31')).toBe('personel-takip-2026-08-01-2026-08-31.xlsx')
    expect(personnelDossierFilename(54, '2026-08-08')).toBe('personel-dosyasi-54-2026-08-08.xlsx')
  })
})
