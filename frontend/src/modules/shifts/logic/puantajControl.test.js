import { describe, expect, it } from 'vitest'
import { buildPuantajControl } from './puantajControl.js'

describe('buildPuantajControl', () => {
  it('marks scheduled, empty and missing weekly-off issues', () => {
    const control = buildPuantajControl({
      month: '2026-07',
      staffRows: [
        { id: 1, full_name: 'Ali Yilmaz', dept_name: 'Teknik' },
        { id: 2, full_name: 'Ayse Kaya', dept_name: 'Teknik' },
      ],
      daysByStaff: {
        1: [
          { date: '2026-07-01', status: 'scheduled' },
          { date: '2026-07-02', status: 'worked' },
          { date: '2026-07-03', status: 'off' },
        ],
        2: [
          { date: '2026-07-01', status: 'worked', overtime_hours: 2 },
          { date: '2026-07-02', status: 'absent' },
        ],
      },
      holidays: [{ date: '2026-07-01', name: 'Test Tatil' }],
    })

    expect(control.staffCount).toBe(2)
    expect(control.totals.scheduled).toBe(1)
    expect(control.totals.absent).toBe(1)
    expect(control.totals.absentWithoutReason).toBe(1)
    expect(control.totals.overtimeHours).toBe(2)
    expect(control.scheduledCells).toHaveLength(1)
    expect(control.missingOffStaff).toBe(1)
    expect(control.missingAbsenceReasonStaff).toBe(1)
    expect(control.readyToClose).toBe(false)
    expect(control.staffIssues[0].issueLabels.join(' | ')).toContain('boş gün')
  })
})
