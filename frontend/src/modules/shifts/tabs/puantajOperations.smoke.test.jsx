import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PuantajOperationsContent } from './PuantajOperationsView.jsx'

const payload = {
  metrics: {
    active_staff: 12,
    scheduled: 9,
    worked: 7,
    on_leave: 1,
    absent: 1,
    pending_scan: 2,
    coverage_missing: 1,
    pending_leave_requests: 1,
    pending_overtime_requests: 1,
    overtime_hours_month: 34,
    employer_cost_month: 125000,
  },
  roster: [
    {
      schedule_id: 1,
      staff_id: 7,
      full_name: 'Okutma Bekleyen',
      dept_name: 'Mutfak',
      role_name: 'Ikramci',
      shift_name: 'Sabah',
      start_hour: 6,
      end_hour: 15,
      work_location_name: 'OTC Yemekhane',
      attendance_state: 'pending_scan',
      event_count: 0,
      open_exception_count: 0,
      overtime_hours: 0,
    },
  ],
  coverage: [
    { rule_id: 1, work_date: '2026-07-14', name: 'Yemekhane acilisi', work_location_name: 'OTC Yemekhane', role_name: 'Ikramci', start_time: '06:00', end_time: '09:00', assigned: 2, min_staff: 3, missing: 1 },
  ],
  pending: {
    leaves: [{ id: 1, staff_id: 8, full_name: 'Izin Bekleyen', dept_name: 'Mutfak', start_date: '2026-07-20', end_date: '2026-07-21', leave_type: 'annual' }],
    overtime: [{ id: 2, staff_id: 9, full_name: 'Mesai Bekleyen', dept_name: 'Teknik', work_date: '2026-07-14', requested_hours: 2 }],
  },
  duty_managers: [{ staff_id: 10, full_name: 'Vardiya Amiri', shift_name: 'Sabah' }],
  risks: [{ type: 'high_overtime', severity: 'warning', staff_id: 11, full_name: 'Yuksek Mesai', dept_name: 'Teknik', value: 34, message: '34 saat aylik mesai' }],
  trends: [{ date: '2026-07-14', scheduled: 9, worked: 7, on_leave: 1, absent: 1, off: 0, overtime_hours: 3, open_exceptions: 2, coverage_missing: 1, not_due: false }],
  breakdowns: {
    departments: [{ dimension: 'department', dimension_id: 1, name: 'Mutfak', staff_count: 8, person_days: 80, worked_days: 60, leave_days: 10, absent_days: 2, overtime_hours: 12, employer_total_cost: 90000 }],
    roles: [{ dimension: 'role', dimension_id: 1, name: 'Ikramci', staff_count: 5, person_days: 50, worked_days: 40, leave_days: 5, absent_days: 1 }],
    locations: [{ dimension: 'location', dimension_id: 1, name: 'OTC Yemekhane', staff_count: 6, person_days: 55, worked_days: 44, leave_days: 4, absent_days: 1 }],
  },
}

describe('Puantaj operations workspace', () => {
  it('renders daily flow, coverage, requests, trends and cost breakdowns', () => {
    render(<PuantajOperationsContent payload={payload} selectedDate="2026-07-14" />)

    expect(screen.getByText('GUNLUK PERSONEL AKISI')).toBeInTheDocument()
    expect(screen.getByText('Okutma Bekleyen')).toBeInTheDocument()
    expect(screen.getByText('Okutma bekliyor')).toBeInTheDocument()
    expect(screen.getByText('Yemekhane acilisi')).toBeInTheDocument()
    expect(screen.getByText('Izin Bekleyen')).toBeInTheDocument()
    expect(screen.getByText('Yuksek Mesai')).toBeInTheDocument()
    expect(screen.getByText('DEPARTMAN / MALIYET')).toBeInTheDocument()
    expect(screen.getAllByText('OTC Yemekhane').length).toBeGreaterThan(1)
  })

  it('opens personnel and changes the selected trend day', () => {
    const onPersonClick = vi.fn()
    const onSelectedDate = vi.fn()
    render(
      <PuantajOperationsContent
        payload={payload}
        selectedDate="2026-07-14"
        onSelectedDate={onSelectedDate}
        onPersonClick={onPersonClick}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Okutma Bekleyen' }))
    expect(onPersonClick).toHaveBeenCalledWith(7)
    fireEvent.click(screen.getByText(/14 Tem/))
    expect(onSelectedDate).toHaveBeenCalledWith('2026-07-14')
  })
})
