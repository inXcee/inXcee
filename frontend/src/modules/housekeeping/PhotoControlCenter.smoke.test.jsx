import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import PhotoControlCenter from './PhotoControlCenter.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

const today = new Date().toLocaleDateString('sv-SE')
const response = {
  retention_days: 7,
  period_days: 7,
  summary: { total: 3, completed: 2, with_photo: 1, without_photo: 1, pending: 1, skipped: 0 },
  items: [
    { id: 1, area: 'M1 Oda 101', block: 'M1', floor: 1, area_code: 'room', scheduled_at: `${today} 08:00:00`, completed_at: `${today} 09:00:00`, photo_url: '/uploads/one.jpg', skipped: 0 },
    { id: 2, area: 'M1 1.Kat Koridor', block: 'M1', floor: 1, area_code: 'corridor', scheduled_at: `${today} 08:00:00`, completed_at: `${today} 09:10:00`, photo_url: null, skipped: 0 },
    { id: 3, area: 'M2 2.Kat Tuvalet / WC', block: 'M2', floor: 2, area_code: 'toilet', scheduled_at: `${today} 08:00:00`, completed_at: null, photo_url: null, skipped: 0 },
  ],
}

beforeEach(() => {
  api.get.mockResolvedValue({ data: response })
  api.patch.mockResolvedValue({ data: { retention_days: 3, options: [3, 7] } })
  api.post.mockResolvedValue({ data: { references_cleared: 0 } })
  useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
})

afterEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: null })
})

describe('housekeeping/PhotoControlCenter smoke', () => {
  it('oda ve ortak alan kanitlarini tek merkezde durumlariyla listeler', async () => {
    renderWithProviders(<PhotoControlCenter />)
    expect(screen.getByText('📷 TEMİZLİK FOTOĞRAF KONTROL MERKEZİ')).toBeInTheDocument()
    expect(await screen.findByText('M1 Oda 101')).toBeInTheDocument()
    expect(screen.getByText('M1 1.Kat Koridor')).toBeInTheDocument()
    expect(screen.getByText('M2 2.Kat Tuvalet / WC')).toBeInTheDocument()
    expect(screen.getAllByText(/FOTOĞRAF EKS/i).length).toBeGreaterThan(0)
  })

  it('blok ve alan filtresi uygular', async () => {
    renderWithProviders(<PhotoControlCenter />)
    await screen.findByText('M1 Oda 101')
    fireEvent.change(screen.getByLabelText('Blok filtresi'), { target: { value: 'M2' } })
    expect(screen.queryByText('M1 Oda 101')).not.toBeInTheDocument()
    expect(screen.getByText('M2 2.Kat Tuvalet / WC')).toBeInTheDocument()
  })

  it('yonetici 3 gun saklama politikasini secebilir', async () => {
    renderWithProviders(<PhotoControlCenter />)
    await screen.findByText('3 GÜN SAKLA')
    fireEvent.click(screen.getByText('3 GÜN SAKLA'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/housekeeping/photo-retention', { retention_days: 3 }))
  })
})
