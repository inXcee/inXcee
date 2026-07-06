import { describe, it, expect } from 'vitest'
import { dayCode, buildFoyuRow, FOYU_TOTAL_COLUMNS } from './puantajFoyu.js'

describe('dayCode', () => {
  it('durum kodlarını eşler', () => {
    expect(dayCode({ status: 'worked' }).code).toBe('N')
    expect(dayCode({ status: 'overtime' }).code).toBe('N')
    expect(dayCode({ status: 'off' }).code).toBe('h')
    expect(dayCode({ status: 'on_leave', leave_type: 'sick' }).code).toBe('r')
    expect(dayCode({ status: 'on_leave', leave_type: 'unpaid' }).code).toBe('üi')
    expect(dayCode({ status: 'on_leave', leave_type: 'annual' }).code).toBe('yi')
    expect(dayCode({ status: 'on_leave', leave_type: 'marriage' }).code).toBe('i')
    expect(dayCode({ status: 'absent' }).code).toBe('Y')
    expect(dayCode({ status: 'scheduled' }).code).toBe('P')
  })

  it('kayıt yoksa boş kod döner', () => {
    expect(dayCode(undefined).code).toBe('')
    expect(dayCode({ status: 'no_record' }).code).toBe('')
    expect(dayCode({ status: 'sunday' }).code).toBe('')
  })
})

describe('buildFoyuRow', () => {
  const staff = { id: 7, full_name: 'Test Personel', dept_name: 'Teknik' }
  const days = [
    { date: '2026-07-01', status: 'worked' },
    { date: '2026-07-02', status: 'worked', overtime_hours: 3 },
    { date: '2026-07-03', status: 'worked' }, // resmi tatil → RT çalışması
    { date: '2026-07-04', status: 'off' },
    { date: '2026-07-05', status: 'sunday' },
    { date: '2026-07-06', status: 'on_leave', leave_type: 'annual' },
    { date: '2026-07-07', status: 'on_leave', leave_type: 'sick' },
    { date: '2026-07-08', status: 'on_leave', leave_type: 'unpaid' },
    { date: '2026-07-09', status: 'on_leave', leave_type: 'bereavement' },
    { date: '2026-07-10', status: 'absent', absent_reason: 'mazeretsiz' },
    { date: '2026-07-11', status: 'no_record' },
  ]
  const holidaySet = new Set(['2026-07-03'])

  it('hücre kodları ve toplamlar doğru', () => {
    const row = buildFoyuRow(staff, days, holidaySet)
    expect(row.cells.map(c => c.code)).toEqual(['N', 'N', 'N', 'h', '', 'yi', 'r', 'üi', 'i', 'Y', ''])
    expect(row.totals).toEqual({
      worked: 3, off: 1, annual: 1, sick: 1, unpaid: 1, otherLeave: 1,
      absent: 1, fmHours: 3, holidayWorked: 1,
    })
  })

  it('toplam kolon sırası FOYU_TOTAL_COLUMNS ile eşleşir', () => {
    const row = buildFoyuRow(staff, days, holidaySet)
    const values = FOYU_TOTAL_COLUMNS.map(col => row.totals[col.key])
    expect(values).toEqual([3, 1, 1, 1, 1, 1, 1, 3, 1])
  })
})
