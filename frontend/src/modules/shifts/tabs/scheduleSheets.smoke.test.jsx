import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DailyView, WeekFillSheet, CellAssignSheet } from './scheduleSheets.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui) => render(<QueryClientProvider client={qc()}>{ui}</QueryClientProvider>)

const shiftDefs = [{ id: 1, name: 'Gündüz', start_hour: 8, end_hour: 17, color_class: 'bg-blue-400' }]

describe('scheduleSheets smoke', () => {
  it('DailyView tarih kontrolüyle render olur', () => {
    wrap(<DailyView departments={[]} date="2026-06-08" onDateChange={() => {}} />)
    expect(screen.getByText('Bugün')).toBeInTheDocument()
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
  })
})
