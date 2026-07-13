import { describe, expect, it } from 'vitest'
import { buildPuantajControl } from './puantajControl.js'

describe('buildPuantajControl', () => {
  it('marks scheduled, empty and missing weekly-off issues', () => {
    const control = buildPuantajControl({
      month: '2026-07',
      closingMode: true,
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
    expect(control.dailyIssuesByDate['2026-07-01'].map(issue => issue.type)).toContain('scheduled')
    expect(control.dailyIssuesByDate['2026-07-02'].map(issue => issue.type)).toContain('absence_reason')
    expect(control.dailyIssuesByDate['2026-07-03']).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'empty', staff: expect.objectContaining({ id: 2 }) }),
    ]))
  })

  it('keeps future days out of current-month operational warnings', () => {
    const completedDays = Array.from({ length: 13 }, (_, index) => index + 1)
      .filter(day => new Date(2026, 6, day).getDay() !== 0)
      .map(day => ({
        date: `2026-07-${String(day).padStart(2, '0')}`,
        status: day === 6 ? 'off' : 'worked',
      }))

    const control = buildPuantajControl({
      month: '2026-07',
      asOfDate: '2026-07-13',
      staffRows: [{ id: 1, full_name: 'Ali Yilmaz', dept_name: 'Teknik' }],
      daysByStaff: {
        1: [
          ...completedDays,
          { date: '2026-07-20', status: 'scheduled' },
        ],
      },
    })

    expect(control.dueDayCount).toBe(13)
    expect(control.notDueDayCount).toBe(18)
    expect(control.totals.empty).toBe(0)
    expect(control.totals.scheduled).toBe(0)
    expect(control.staffIssues).toHaveLength(0)
    expect(control.operationalCompletionRate).toBe(100)
    expect(control.readyToDate).toBe(true)
    expect(control.closing.totals.scheduled).toBe(1)
    expect(control.closing.totals.empty).toBeGreaterThan(0)
    expect(control.closingCompletionRate).toBeLessThan(100)
    expect(control.readyToClose).toBe(false)
    expect(control.dailyRows.find(day => day.date === '2026-07-20')).toMatchObject({
      isDue: false,
      notDue: true,
      scheduled: 0,
      empty: 0,
    })
  })
})
