import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import KioskDevicesPage from './KioskDevicesPage.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}))

const OVERVIEW = {
  devices: { registered: 2, online: 1, offline: 1, locked: 0, revoked: 0, pending_enrollment: 1 },
  pin_coverage: {
    staff: { total: 125, configured: 5 },
    personnel: { total: 121, configured: 0 },
  },
  queues: { pending: 4, errors: 1, affected_devices: 1 },
}

const DEVICES = [
  {
    id: 'device-1', name: 'Çamaşır Pilot', device_type: 'laundry_terminal', mode: 'shared',
    location: 'Çamaşırhane', status: 'active', online: true, queue_count: 4, error_count: 1,
    app_version: 'web-1', capabilities: { camera: true }, last_seen_at: '2026-08-12 15:00:00',
  },
]

describe('Kiosk cihaz yönetimi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
    api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/overview') ? OVERVIEW : DEVICES }))
    api.post.mockResolvedValue({ data: { code: 'KE-TESTCODE', expires_at: '2026-08-12T18:00:00.000Z' } })
    api.patch.mockResolvedValue({ data: DEVICES[0] })
  })

  it('hazırlık KPI’larını ve cihaz sağlık bilgisini gösterir', async () => {
    renderWithProviders(<KioskDevicesPage />)
    expect(await screen.findByText('Çamaşır Pilot')).toBeInTheDocument()
    expect(screen.getByText('5 / 125')).toBeInTheDocument()
    expect(screen.getByText('0 / 121')).toBeInTheDocument()
    expect(screen.getByText(/4 işlem/)).toBeInTheDocument()
    expect(screen.getByText('ÇEVRİMİÇİ')).toBeInTheDocument()
  })

  it('yönetici tek kullanımlık kayıt kodu üretir ve kod yalnız sonuçta görünür', async () => {
    renderWithProviders(<KioskDevicesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni cihaz kaydı' }))
    fireEvent.change(screen.getByLabelText('Cihaz adı'), { target: { value: 'AVS Ortak 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kayıt kodu üret' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/kiosk-management/enrollment-codes', expect.objectContaining({ name: 'AVS Ortak 1' })))
    expect(await screen.findByText('KE-TESTCODE')).toBeInTheDocument()
  })

  it('vardiya amirinde yönetim işlemleri görünmez', async () => {
    useAuthStore.setState({ user: { id: 2, role: 'shift_supervisor' } })
    renderWithProviders(<KioskDevicesPage />)
    await screen.findByText('Çamaşır Pilot')
    expect(screen.queryByRole('button', { name: 'Yeni cihaz kaydı' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cihazı kilitle' })).not.toBeInTheDocument()
  })
})
