import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/components/QrScannerModal.jsx', () => ({
  default: ({ open }) => open ? <div>QR tarayıcı açık</div> : null,
}))

const trip = {
  id: 51,
  work_date: '2026-07-28',
  direction: 'outbound',
  scheduled_departure: '2026-07-28T07:00',
  status: 'boarding',
  route_name: 'Sahil Hattı',
  route_color: '#22c55e',
  vehicle_plate: '67 OPS 01',
  driver_name: 'Deniz Şoför',
  capacity_snapshot: 16,
  assigned_count: 5,
  boarded_count: 7,
  no_show_count: 1,
  waitlisted_count: 2,
}

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(url => {
      if (url.includes('/operations')) return Promise.resolve({
        data: {
          trips: [trip],
          totals: { capacity: 16, assigned: 5, boarded: 7, no_show: 1, waitlisted: 2 },
          next_trip: { ...trip, next_action: { key: 'depart', label: 'Kalkışı onayla' } },
        },
      })
      if (url === '/transport/trips/51') return Promise.resolve({
        data: {
          ...trip,
          assignments: [{
            id: 1,
            staff_id: 4,
            full_name: 'Ali Kaya',
            pickup_name: 'Merkez Durak',
            status: 'assigned',
          }],
          events: [],
        },
      })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({ data: { ok: true } })),
    patch: vi.fn(() => Promise.resolve({ data: { ok: true } })),
  },
}))

import OperationsTab from './OperationsTab.jsx'

describe('Transport V2 operations UI', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders command counters, next action and trip card', async () => {
    renderWithProviders(<OperationsTab date="2026-07-28" />)
    expect(await screen.findByText('Sahil Hattı')).toBeInTheDocument()
    expect(screen.getByText('Kalkışı onayla →')).toBeInTheDocument()
    expect(screen.queryByText('BİNİŞİ BAŞLAT', { exact: false })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'KALKIŞ YAP' })).toBeInTheDocument()
  })

  it('opens manifest and exposes one-tap assignment actions', async () => {
    renderWithProviders(<OperationsTab date="2026-07-28" />)
    fireEvent.click(await screen.findByRole('button', { name: 'MANİFESTO' }))
    expect(await screen.findByRole('dialog', { name: 'Sefer manifestosu' })).toBeInTheDocument()
    expect(await screen.findByText('Ali Kaya')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BİNDİ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BİNMEDİ' })).toBeInTheDocument()
  })
})
