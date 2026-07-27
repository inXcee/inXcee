import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'

// RouteMap'i mock'la (Leaflet jsdom'da render edilmez)
vi.mock('../RouteMap.jsx', () => ({ default: () => <div data-testid="route-map" /> }))

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/routes')) return Promise.resolve({ data: [
        { id: 1, name: 'Kozlu Hatti', color: '#16a34a', vehicle_plate: '67 ABC 01', capacity: 16, driver_name: 'Ali', stops: [{ id: 1, sequence_order: 1, lat: 41.43, lng: 31.74 }] },
      ] })
      if (url.includes('/pickup-points')) return Promise.resolve({ data: [
        { id: 1, name: 'Kozlu Meydan', district: 'Kozlu', lat: 41.43, lng: 31.74, staff_count: 5, route_count: 1 },
        { id: 2, name: 'Konumsuz Durak', district: 'X', lat: null, lng: null, staff_count: 2, route_count: 0 },
      ] })
      return Promise.resolve({ data: [] })
    }),
  },
}))

import MapTab from './MapTab.jsx'

describe('transport/MapTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('legend rota adi + plaka render eder', async () => {
    renderWithProviders(<MapTab />)
    expect(await screen.findByText('Kozlu Hatti')).toBeInTheDocument()
    expect(screen.getByText(/67 ABC 01/)).toBeInTheDocument()
  })

  it('konumsuz durak uyarisini gosterir', async () => {
    renderWithProviders(<MapTab />)
    expect(await screen.findByText(/1 durak konumsuz/)).toBeInTheDocument()
  })

  it('rota gizle toggle\'i legend\'da calisir', async () => {
    renderWithProviders(<MapTab />)
    const toggle = await screen.findByLabelText('Kozlu Hatti rotasını gizle/göster')
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
  })
})

describe('transport/MapTab smoke — düzenleme yetkisi', () => {
  afterEach(() => useAuthStore.setState({ user: null }))

  it('campus_manager için düzenle butonu görünür', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
    renderWithProviders(<MapTab />)
    expect(await screen.findByLabelText('Kozlu Hatti rotasını haritadan düzenle')).toBeInTheDocument()
  })

  it('yetkisiz rol için düzenle butonu görünmez', async () => {
    useAuthStore.setState({ user: { id: 2, role: 'laundry' } })
    renderWithProviders(<MapTab />)
    await screen.findByText('Kozlu Hatti')
    expect(screen.queryByLabelText('Kozlu Hatti rotasını haritadan düzenle')).not.toBeInTheDocument()
  })
})
