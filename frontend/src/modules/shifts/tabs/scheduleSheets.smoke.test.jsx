import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { DailyView, WeekFillSheet, CellAssignSheet } from './scheduleSheets.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui) => render(<QueryClientProvider client={qc()}>{ui}</QueryClientProvider>)

const shiftDefs = [{ id: 1, name: 'Gündüz', start_hour: 8, end_hour: 17, color_class: 'bg-blue-400' }]

describe('scheduleSheets smoke', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: [] })
  })

  it('DailyView tarih kontrolüyle render olur', () => {
    wrap(<DailyView departments={[]} date="2026-06-08" onDateChange={() => {}} />)
    expect(screen.getByText('Bugün')).toBeInTheDocument()
  })

  it('DailyView vardiya saatini ve izin türünü gösterir', async () => {
    api.get.mockResolvedValueOnce({ data: [
      {
        full_name: 'Ali Veli',
        dept_name: 'Temizlik',
        dept_color: 'dept-blue',
        shift_status: 'scheduled',
        shift_name: 'Gündüz',
        start_hour: 8,
        end_hour: 17,
        shift_color: 'shift-blue',
      },
      {
        full_name: 'Ayşe Kaya',
        dept_name: 'Temizlik',
        dept_color: 'dept-blue',
        shift_status: 'on_leave',
        leave_type: 'sick',
      },
    ] })
    wrap(<DailyView departments={[]} date="2026-06-08" onDateChange={() => {}} />)
    expect(await screen.findByText('08:00–17:00')).toBeInTheDocument()
    expect(await screen.findByText(/Ayşe Kaya \(Raporlu\)/)).toBeInTheDocument()
  })

  it('WeekFillSheet kişi adını ve vardiya seçeneklerini gösterir', () => {
    wrap(<WeekFillSheet
      weekFillPopover={{ person: { id: 1, full_name: 'Test Kişi', dept_id: 1, dept_name: 'Temizlik' } }}
      setWeekFillPopover={() => {}} shiftDefs={shiftDefs}
      weekFillDef="1" setWeekFillDef={() => {}} weekFillOffDay={6} setWeekFillOffDay={() => {}}
      fillWeek={{ mutate: () => {}, isPending: false }}
      weekStart="2026-06-08" weekEnd="2026-06-14"
      formatDate={d => d} shiftColor={() => ({ bg: '', text: '' })}
    />)
    expect(screen.getByText(/Test Kişi/)).toBeInTheDocument()
    expect(screen.getByText('08:00–17:00')).toBeInTheDocument()
  })

  it('CellAssignSheet hücre bilgisiyle render olur', () => {
    wrap(<CellAssignSheet
      cellPopover={{ person: { id: 1, full_name: 'Test Kişi', dept_id: 1 }, date: '2026-06-08', current: null }}
      setCellPopover={() => {}} shiftDefs={shiftDefs}
      assignCell={{ mutate: () => {}, isPending: false }}
      deleteShift={{ mutate: () => {}, isPending: false }}
      formatDate={d => d} shortDay={() => 'Pt'} shiftColor={() => ({ bg: '', text: '' })}
    />)
    expect(screen.getByText('VARDIYA SEÇ')).toBeInTheDocument()
    expect(screen.getByText('08:00–17:00')).toBeInTheDocument()
  })
})
