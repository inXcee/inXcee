import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'

const getMock = vi.fn(() => Promise.resolve({ data: [] }))
vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: (...args) => getMock(...args),
  },
}))

import PuantajTab from './PuantajTab.jsx'

describe('PuantajTab smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ token: null, user: null })
    getMock.mockImplementation(() => Promise.resolve({ data: [] }))
  })

  it('çökmeden render olur ve görünüm kontrollerini gösterir', () => {
    renderWithProviders(<PuantajTab departments={[]} />)
    expect(screen.getByText('ONAY')).toBeInTheDocument()
    expect(screen.getByText(/CSV İndir/)).toBeInTheDocument()
    expect(screen.getByText('📋 LİSTE')).toBeInTheDocument()
    expect(screen.getByText('🔎 KONTROL')).toBeInTheDocument()
    expect(screen.getByText('PUANTAJ KAPANIŞ KONTROLÜ')).toBeInTheDocument()
    expect(screen.getByText(/P → N/)).toBeInTheDocument()
  })

  it('onay masasında departman onay matrisi görünür (P4)', async () => {
    useAuthStore.setState({ user: { role: 'campus_manager' } })
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj/approval/overview') {
        return Promise.resolve({ data: {
          period: '2026-07', total_days: 31,
          all: { period_status: 'draft' },
          departments: [
            { dept_id: 1, name: 'Yemekhane', staff_count: 8, period_status: 'submitted', approved_days: 5, pending_days: 2, returned_days: 1, last_event_at: '2026-07-10 10:00:00', issues: { scheduled: 1, empty: 3, absent_no_reason: 0 } },
          ],
        } })
      }
      if (url === '/shifts/puantaj/approval') {
        return Promise.resolve({ data: { period: '2026-07', period_approval: { status: 'draft' }, daily_approvals: [], events: [] } })
      }
      return Promise.resolve({ data: [] })
    })
    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getByText('ONAY'))
    expect(await screen.findByText('DEPARTMAN ONAY MATRISI')).toBeInTheDocument()
    expect(screen.getByText('Yemekhane')).toBeInTheDocument()
    expect(screen.getByText('5/31')).toBeInTheDocument()
  })

  it('calendar keeps day entries when days endpoint returns full payload', async () => {
    getMock.mockImplementation((url) => {
      if (url === '/shifts/puantaj') {
        return Promise.resolve({ data: [
          { id: 1, full_name: 'Ali Test', department_id: 1, dept_name: 'OTC', worked_days: 1, off_days: 1 },
        ] })
      }
      if (url === '/shifts/puantaj/days') {
        return Promise.resolve({ data: {
          month: '2026-07',
          days: {
            1: [
              { date: '2026-07-01', day_of_week: 3, status: 'worked' },
              { date: '2026-07-02', day_of_week: 4, status: 'off' },
            ],
          },
        } })
      }
      if (url === '/shifts/holidays') return Promise.resolve({ data: [] })
      if (url === '/shifts/puantaj/codes') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<PuantajTab departments={[]} />)
    fireEvent.click(screen.getAllByText(/TAKV/)[0])

    const workedCell = await screen.findByTitle(/Ali Test.*2026-07-01/)
    const offCell = await screen.findByTitle(/Ali Test.*2026-07-02/)
    expect(workedCell).toHaveTextContent('N')
    expect(offCell).toHaveTextContent('H')
  })
})
