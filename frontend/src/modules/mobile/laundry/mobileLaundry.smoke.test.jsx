import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LaundryHome from './LaundryHome.jsx'
import GarmentChecklist from './GarmentChecklist.jsx'
import mobileApi from '../auth/mobileApi.js'

vi.mock('../auth/mobileApi.js', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('../../../shared/hooks/usePullToRefresh.js', () => ({
  usePullToRefresh: () => ({ isPulling: false, handlers: {} }),
}))

function renderWithQuery(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('mobile laundry canonical workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mobileApi.get.mockResolvedValue({ data: [] })
    mobileApi.put.mockResolvedValue({ data: { garment: { id: 11, status: 'ready' } } })
    mobileApi.post.mockResolvedValue({ data: { ok: true } })
  })

  it('shows the ironing status and queries canonical laundry_items', async () => {
    renderWithQuery(<LaundryHome />)
    fireEvent.click(screen.getByRole('button', { name: 'Ütüde' }))
    await waitFor(() => {
      expect(mobileApi.get).toHaveBeenCalledWith('/laundry/items?status=ironing')
    })
  })

  it('persists an individual garment tick through the shared management endpoint', async () => {
    mobileApi.get.mockResolvedValueOnce({
      data: [{
        id: 11,
        garment_code: 'G7-01',
        garment_type: 'Gömlek',
        emoji: '👔',
        requires_ironing: 1,
        status: 'ironing',
      }],
    })
    renderWithQuery(
      <GarmentChecklist
        item={{ id: 7, bag_no: 'T-00007', block: 'A', room_no: '101' }}
        onClose={vi.fn()}
      />
    )
    expect(await screen.findByText('G7-01')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '○' }))
    await waitFor(() => {
      expect(mobileApi.put).toHaveBeenCalledWith(
        '/laundry/items/7/garments/11/ironing',
        expect.objectContaining({ completed: true, client_action_id: expect.stringContaining('mobile-11-') })
      )
    })
  })
})
