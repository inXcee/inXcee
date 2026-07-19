import { describe, expect, it } from 'vitest'
import { buildWeeklySignatureModel } from './scheduleSignatureExport.js'
import {
  computeWeeklySignatureImageLayout,
  createStoredZip,
  weeklySignatureImageFilename,
  weeklySignaturePageFilename,
} from './weeklySignatureImageExport.js'

const DATES = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19']

function weeklyPeople(count = 12) {
  return Array.from({ length: count }, (_, index) => ({
    full_name: `Personel ${index + 1}`,
    dept_name: 'Teknik Bakım',
    role_name: 'Teknisyen',
    days: Object.fromEntries(DATES.map((date, dayIndex) => [date, dayIndex === 2
      ? { status: 'off' }
      : { status: 'scheduled', shift_name: 'Gündüz', start_hour: 8, end_hour: 17 }])),
  }))
}

describe('weekly signature image export', () => {
  it('computes a landscape page layout that keeps change rows on the canvas', () => {
    const model = buildWeeklySignatureModel({ people: weeklyPeople(25), dates: DATES, options: { groupMode: 'combined', rowsPerPage: 25, blankRows: 3 } })
    const layout = computeWeeklySignatureImageLayout(model, model.pages[0])

    expect(layout.width / layout.height).toBeGreaterThan(1.4)
    expect(layout.blankRows).toBe(3)
    expect(layout.dayWidth).toBeGreaterThan(100)
    expect(layout.showDepartmentBands).toBe(true)
    expect(layout.departmentBandCount).toBe(1)
    expect(layout.rowHeight).toBeGreaterThanOrEqual(20)
    expect(layout.rowHeight).toBeLessThan(30)
  })

  it('uses a PNG for one page and a ZIP package for multiple pages', () => {
    expect(weeklySignatureImageFilename(DATES[0], '4', 1)).toBe('haftalik-imza-foyu-2026-07-13-r4.png')
    expect(weeklySignatureImageFilename(DATES[0], '4', 2)).toBe('haftalik-imza-foyleri-2026-07-13-r4.zip')
    expect(weeklySignaturePageFilename({ department: 'Teknik Bakım', page: 2, page_count: 2 }, 1)).toBe('02-teknik-bakim-sayfa-2.png')
  })

  it('creates a valid stored ZIP with UTF-8 filenames', async () => {
    const zip = createStoredZip([
      { name: '01-teknik.png', data: new Uint8Array([1, 2, 3]) },
      { name: '02-mutfak.png', data: new Uint8Array([4, 5]) },
    ])
    const buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(zip)
    })
    const bytes = new Uint8Array(buffer)
    const view = new DataView(bytes.buffer)

    expect(zip.type).toBe('application/zip')
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50)
    expect(view.getUint16(bytes.length - 12, true)).toBe(2)
  })
})
