import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'

const getMock = vi.fn()
vi.mock('../../../shared/api/client.js', () => ({
  default: { get: (...args) => getMock(...args) },
}))

import CoverageBoard from './CoverageBoard.jsx'

const weekDays = ['2027-01-04', '2027-01-05']

function mockApi() {
  getMock.mockImplementation((url) => {
    if (url === '/shifts/coverage') return Promise.resolve({ data: { shifts: [], counts: [] } })
    if (url === '/shifts/breakdown') return Promise.resolve({ data: {
      location_counts: [], role_counts: [],
      site_counts: [{ work_date: '2027-01-05', site: 'OTC', assigned: 2 }],
    } })
    if (url === '/shifts/breakdown/assignees') return Promise.resolve({ data: {
      date: '2027-01-05', dimension: 'site', value: 'OTC',
      assignees: [{ staff_id: 7, full_name: 'Ali Veli', dept_name: 'Yemekhane', role_name: 'Ikramci', shift_name: 'Gunduz', start_hour: 8, end_hour: 16, work_location_name: 'OTC Lokal', work_location_color: 'teal' }],
    } })
    return Promise.resolve({ data: {} })
  })
}

describe('CoverageBoard smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ user: { role: 'campus_manager' } })
    mockApi()
  })

  it('açılır, site kırılımını gösterir, hücreye tıklayınca kişileri açar', async () => {
    const onPersonClick = vi.fn()
    renderWithProviders(<CoverageBoard from="2027-01-04" to="2027-01-05" weekDays={weekDays} onPersonClick={onPersonClick} />)
    fireEvent.click(screen.getByText('▼ Aç'))
    await waitFor(() => expect(screen.getByText('OTC')).toBeInTheDocument())

    // Site satırındaki dolu hücre (2) tıklanabilir — title ile hedefle (Toplam kolonuyla karışmasın)
    const cell = await screen.findByTitle(/OTC .* kişi \(tıkla\)/)
    fireEvent.click(cell)
    await waitFor(() => expect(screen.getByText('Ali Veli')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Ali Veli'))
    expect(onPersonClick).toHaveBeenCalledWith(7)
  })
})
