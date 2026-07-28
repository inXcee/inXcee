import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DriverTripPage from './DriverTripPage.jsx'

const manifest = {
  expires_at: '2099-09-12T20:00:00.000Z',
  privacy: 'Telefon numaraları şoför görünümünde gizlidir.',
  trip: {
    id: 8,
    route_name: 'Merkez Hattı',
    direction: 'outbound',
    scheduled_departure: '2099-09-12T07:30',
    status: 'published',
    vehicle_plate: '67 TEST 1',
    capacity: 16,
  },
  manifest: [{
    id: 1,
    full_name: 'Test Personel',
    stop_name: 'Merkez Durağı',
    scheduled_time: '07:10',
    status: 'assigned',
  }],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/driver/trips/token-123']}>
      <Routes>
        <Route path="/driver/trips/:token" element={<DriverTripPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DriverTripPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => manifest })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, status: 'departed' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...manifest, trip: { ...manifest.trip, status: 'departed' } }),
      }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows a privacy-safe manifest and lets the driver start the trip', async () => {
    renderPage()
    expect(await screen.findByText('Merkez Hattı')).toBeInTheDocument()
    expect(screen.getByText('Test Personel')).toBeInTheDocument()
    expect(screen.getByText(/Telefon numaraları/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'SEFERE BAŞLADIM' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'SEFERİ TAMAMLADIM' })).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith('/public/transport/trips/token-123', expect.objectContaining({ method: 'POST' }))
  })
})
