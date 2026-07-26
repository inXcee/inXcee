import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CleaningTracking, CompanyTracking, ShiftTracking } from './BlockTrackingPanels.jsx'

const shifts = {
  total: 3, day: 1, night: 1, unknown: 1, coverage_pct: 67,
  residents: [
    { personnel_id: 1, full_name: 'Ali Gündüz', company: 'Eksen', room_no: '101', bed_no: 1, shift_type: 'day', start_hour: 8, end_hour: 17 },
    { personnel_id: 2, full_name: 'Veli Gece', company: 'Mavi', room_no: '102', bed_no: 2, shift_type: 'night', start_hour: 20, end_hour: 8 },
    { personnel_id: 3, full_name: 'Ayşe Belirsiz', company: 'Eksen', room_no: '103', bed_no: 1, shift_type: 'unknown', start_hour: null, end_hour: null },
  ],
}

const cleaning = {
  total: 2, done: 1, pending: 1, skipped: 0, pct: 50,
  room_tasks: 2, common_area_tasks: 0, photo_evidence_count: 1, qr_verified_count: 1,
  night_shift_room_count: 1,
  floors: [{ floor: 1, total: 2, done: 1, pending: 1, skipped: 0, pct: 50 }],
  tasks: [
    {
      id: 11, area: 'M1 Oda 101', room_no: '101', floor: 1, task_type: 'room', status: 'done',
      companies: ['Eksen'], shift_profile: { day: 1, night: 0, unknown: 0, total: 1 },
      photo_count: 1, verified_by_qr: 1,
    },
    {
      id: 12, area: 'M1 Oda 102', room_no: '102', floor: 1, task_type: 'room', status: 'pending',
      companies: ['Mavi'], shift_profile: { day: 0, night: 1, unknown: 0, total: 1 },
      photo_count: 0, verified_by_qr: 0,
    },
  ],
}

describe('BlockTrackingPanels', () => {
  it('vardiya filtreleriyle gündüz, gece ve belirsiz kişileri ayırır', () => {
    render(<ShiftTracking data={shifts} onNavigate={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Gece · 1' }))
    expect(screen.getByText('Veli Gece')).toBeInTheDocument()
    expect(screen.queryByText('Ali Gündüz')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Belirsiz · 1' }))
    expect(screen.getByText('Ayşe Belirsiz')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ayşe Belirsiz.*Saat tanımsız/i })).toBeInTheDocument()
  })

  it('temizlik görevlerini durum, kat ve oda vardiyasına göre süzer', () => {
    render(
      <CleaningTracking
        data={cleaning}
        date="2026-07-26"
        onDateChange={vi.fn()}
        onNavigate={vi.fn()}
        block="M1"
      />,
    )

    fireEvent.change(screen.getByLabelText('Temizlik durumu'), { target: { value: 'pending' } })
    expect(screen.getByText('M1 Oda 102')).toBeInTheDocument()
    expect(screen.queryByText('M1 Oda 101')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Oda vardiyası'), { target: { value: 'night' } })
    expect(screen.getByText('Şirket · Mavi')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 görev gösteriliyor')).toBeInTheDocument()
  })

  it('şirket kartında oda, vardiya payı ve ilişkili temizlik başarısını gösterir', () => {
    const data = {
      total_companies: 2,
      unassigned_company_count: 0,
      companies: [
        {
          company: 'Eksen', people_count: 2, room_count: 2, share_pct: 67,
          day_count: 1, night_count: 0, unknown_count: 1, dominant_shift: 'day',
          rooms: [{ room_id: 1, room_no: '101', floor: 1 }, { room_id: 3, room_no: '103', floor: 1 }],
          cleaning: { total: 1, done: 1, pending: 0, skipped: 0, pct: 100 },
        },
        {
          company: 'Mavi', people_count: 1, room_count: 1, share_pct: 33,
          day_count: 0, night_count: 1, unknown_count: 0, dominant_shift: 'night',
          rooms: [{ room_id: 2, room_no: '102', floor: 1 }],
          cleaning: { total: 1, done: 0, pending: 1, skipped: 0, pct: 0 },
        },
      ],
    }
    render(<CompanyTracking data={data} date="2026-07-26" onDateChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Şirket ara'), { target: { value: 'Mavi' } })
    expect(screen.getByText('Mavi')).toBeInTheDocument()
    expect(screen.queryByText('Eksen')).not.toBeInTheDocument()
    expect(screen.getByText(/1 kişi · 1 oda/)).toBeInTheDocument()
    expect(screen.getByText('İlişkili oda temizliği')).toBeInTheDocument()
  })
})
