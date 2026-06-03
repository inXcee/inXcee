import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [
      { id: 1, full_name: 'Ayşe Yıldız', phone: '0555', assigned_block: 'M1', assigned_floor: 1 },
      { id: 2, full_name: 'Boş Personel', assigned_block: null },
    ] })),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}))

import StaffSection from './StaffSection.jsx'

describe('housekeeping/StaffSection smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('kata atanmış personeli + atanmamış havuzu listeler', async () => {
    renderWithProviders(<StaffSection block="M1" floor={1} />)
    expect(screen.getByText('TEMİZLİK PERSONELİ')).toBeInTheDocument()
    expect(await screen.findByText('Ayşe Yıldız')).toBeInTheDocument()
    expect(screen.getByText('+ Boş Personel')).toBeInTheDocument()
  })
})
