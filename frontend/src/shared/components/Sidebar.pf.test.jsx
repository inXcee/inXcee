import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import { useAuthStore } from '../store/authStore.js'

let pfMe = 'owner'
vi.mock('../api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url === '/pf/me') return pfMe === 'owner' ? Promise.resolve({ data: { owner: true } }) : Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }))
      return Promise.resolve({ data: {} })
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../hooks/useNotifications.js', () => ({ useNotifications: () => ({ unreadCount: 0 }) }))

import Sidebar from './Sidebar.jsx'
import api from '../api/client.js'

describe('Sidebar — özel finans kasası bağlantısı', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sahip müdür "Kasa" bağlantısını görür', async () => {
    pfMe = 'owner'
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager', username: 'admin' } })
    renderWithProviders(<Sidebar mobileOpen={false} onClose={() => {}} />)
    expect(await screen.findByTestId('pf-link')).toHaveAttribute('href', '/kasa/')
  })

  it('sahip olmayan müdür görmez (404 sessiz)', async () => {
    pfMe = 'hidden'
    useAuthStore.setState({ user: { id: 2, role: 'campus_manager', username: 'mudur_m' } })
    renderWithProviders(<Sidebar mobileOpen={false} onClose={() => {}} />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/pf/me'))
    expect(screen.queryByTestId('pf-link')).not.toBeInTheDocument()
  })

  it('müdür olmayan için istek hiç atılmaz', async () => {
    useAuthStore.setState({ user: { id: 3, role: 'shift_supervisor', username: 'vardiya_m' } })
    renderWithProviders(<Sidebar mobileOpen={false} onClose={() => {}} />)
    await screen.findAllByText(/Dashboard/)
    expect(api.get).not.toHaveBeenCalledWith('/pf/me')
    expect(screen.queryByTestId('pf-link')).not.toBeInTheDocument()
    useAuthStore.setState({ user: null })
  })
})
