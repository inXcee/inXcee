import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import CostCenterView from './CostCenterView.jsx'

describe('CostCenterView', () => {
  it('kg, su, enerji ve toplam maliyet özetini gösterir', async () => {
    const kioskApi = {
      get: vi.fn(() => Promise.resolve({ data: {
        summary: { loads: 2, weight_kg: 18.4, water_liters: 120, energy_kwh: 3.25, total_cost: 86.5, cost_per_kg: 4.7 },
        loads: [{
          id: 1, load_id: 12, machine_name: 'Makine 1', program: 'standard', bag_count: 3,
          weight_kg: 9.2, water_liters: 60, energy_kwh: 1.6, supplies_cost: 12, total_cost: 43.25,
        }],
      } })),
    }
    renderWithProviders(<CostCenterView kioskApi={kioskApi} />)
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
    expect(screen.getByText(/18,4 kg/)).toBeInTheDocument()
    expect(screen.getByText(/120 L/)).toBeInTheDocument()
    expect(screen.getByText('Makine 1')).toBeInTheDocument()
    expect(screen.getAllByText(/₺/).length).toBeGreaterThan(0)
  })
})
