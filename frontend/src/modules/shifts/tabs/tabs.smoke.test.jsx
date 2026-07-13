import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import LeaveTab from './LeaveTab.jsx'
import OvertimeTab from './OvertimeTab.jsx'
import DepartmentsTab from './DepartmentsTab.jsx'
import SwapTab from './SwapTab.jsx'
import SettingsTab from './SettingsTab.jsx'
import PuantajTab from './PuantajTab.jsx'
import api from '../../../shared/api/client.js'

describe('shifts tabs smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('LeaveTab çökmeden render olur', () => {
    renderWithProviders(<LeaveTab departments={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('IZIN TALEPLERI')).toBeInTheDocument()
  })

  it('OvertimeTab çökmeden render olur', () => {
    renderWithProviders(<OvertimeTab departments={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('MESAI KAYITLARI')).toBeInTheDocument()
  })

  it('DepartmentsTab çökmeden render olur', () => {
    renderWithProviders(<DepartmentsTab />)
    expect(screen.getByText('BOLUMLER')).toBeInTheDocument()
  })

  it('SwapTab çökmeden render olur', () => {
    renderWithProviders(<SwapTab />)
    expect(screen.getByText('VARDIYA TAKAS TALEPLERI')).toBeInTheDocument()
  })

  it('SettingsTab çökmeden render olur', () => {
    renderWithProviders(<SettingsTab departments={[]} shiftDefs={[]} />)
    expect(screen.getAllByText('VARDIYA TANIMLARI').length).toBeGreaterThan(0)
  })

  it('SettingsTab rotasyon şablon paneli render olur', () => {
    renderWithProviders(<SettingsTab departments={[]} shiftDefs={[]} />)
    expect(screen.getByText('ROTASYON UYGULA')).toBeInTheDocument()
    expect(screen.getByText('ŞABLONLAR')).toBeInTheDocument()
    expect(screen.getByText(/Önizle/)).toBeInTheDocument()
  })

  it('PuantajTab aylık takvim kod paletini gösterir', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/shifts/puantaj') {
        return Promise.resolve({ data: [{ id: 1, full_name: 'Ali Test', department_id: 1, dept_name: 'Temizlik', worked_days: 1, off_days: 1, sick_leave_days: 1, other_leave_days: 1 }] })
      }
      if (url === '/shifts/puantaj/days') {
        return Promise.resolve({ data: { month: '2026-07', days: { 1: [
          { date: '2026-07-01', day_of_week: 3, status: 'worked' },
          { date: '2026-07-02', day_of_week: 4, status: 'off' },
          { date: '2026-07-03', day_of_week: 5, status: 'on_leave', leave_type: 'sick' },
          { date: '2026-07-04', day_of_week: 6, status: 'on_leave', leave_type: 'unpaid' },
        ] } } })
      }
      if (url === '/shifts/puantaj/approval') {
        return Promise.resolve({ data: {
          period: '2026-07',
          period_approval: { status: 'submitted' },
          daily_approvals: [
            { work_date: '2026-07-01', status: 'approved', approved_by_name: 'Müdür' },
            { work_date: '2026-07-02', status: 'returned', note: 'Eksik' },
          ],
          events: [],
        } })
      }
      return Promise.resolve({ data: [] })
    })
    useAuthStore.setState({ user: { role: 'campus_manager' } })
    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getByText(/TAKVİM/))
    expect(await screen.findByText('Ali Test')).toBeInTheDocument()
    // Gün hücreleri ayrı bir async query'den (puantaj-days-month) gelir — bekle
    expect((await screen.findAllByText('N')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('h').length).toBeGreaterThan(0)
    expect(screen.getAllByText('r').length).toBeGreaterThan(0)
    expect(screen.getByText('Hucre')).toBeInTheDocument()
    expect(screen.getByText('Boya')).toBeInTheDocument()
    expect(screen.getAllByText('üi').length).toBeGreaterThan(0)
    // P3: gün başlığında onay rozetleri (approved=✓, returned=↩)
    expect((await screen.findAllByTitle(/Onay: Onaylandi/)).length).toBe(1)
    expect(screen.getAllByTitle(/Onay: Geri gonderildi/).length).toBe(1)
  })
})
