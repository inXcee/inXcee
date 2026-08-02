import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import SessionsPage from './SessionsPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), delete: vi.fn() },
}))

vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}))

const SAAT = 60 * 60 * 1000

function stamp(msAgo) {
  return new Date(Date.now() - msAgo).toISOString().replace('T', ' ').slice(0, 19)
}

const SESSIONS = [
  {
    jti: 'jti-kiosk', principal_kind: 'staff', principal_id: 5,
    full_name: 'Ayşe Çamaşır', role: 'avs_kiosk',
    created_at: stamp(30 * 24 * SAAT), last_seen_at: stamp(2 * 60 * 1000),
  },
  {
    jti: 'jti-unutulmus', principal_kind: 'staff', principal_id: 6,
    full_name: 'Unutulmuş Tablet', role: 'avs_kiosk',
    created_at: stamp(40 * 24 * SAAT), last_seen_at: stamp(20 * 24 * SAAT),
  },
  {
    jti: 'jti-panel', principal_kind: 'user', principal_id: 1,
    full_name: 'Müdür Bey', role: 'campus_manager',
    created_at: stamp(3 * SAAT), last_seen_at: stamp(5 * 60 * 1000),
  },
]

describe('Açık Oturumlar sayfası', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: SESSIONS })
    api.delete.mockResolvedValue({ data: { ok: true } })
  })

  it('oturumları ad, rol ve son görülme ile listeler', async () => {
    renderWithProviders(<SessionsPage />)
    expect(await screen.findByText('Ayşe Çamaşır')).toBeInTheDocument()
    expect(screen.getByText('Unutulmuş Tablet')).toBeInTheDocument()
    expect(screen.getAllByText(/Kiosk \(AVS personeli\)/).length).toBe(2)
    // Kiosk 2 dk, panel 5 dk önce görülmüş — ikisi de "şu an aktif" eşiğinde.
    expect(screen.getAllByText('Şu an aktif').length).toBe(2)
    expect(screen.getByText('20 gün önce')).toBeInTheDocument()
  })

  it('uzun süredir sessiz oturumları sayar ve filtreler', async () => {
    renderWithProviders(<SessionsPage />)
    await screen.findByText('Ayşe Çamaşır')

    fireEvent.click(screen.getByRole('button', { name: 'Sessiz' }))
    expect(screen.getByText('Unutulmuş Tablet')).toBeInTheDocument()
    expect(screen.queryByText('Ayşe Çamaşır')).not.toBeInTheDocument()
  })

  it('kiosk ve panel oturumlarını ayırır', async () => {
    renderWithProviders(<SessionsPage />)
    await screen.findByText('Müdür Bey')

    fireEvent.click(screen.getByRole('button', { name: 'Panel' }))
    expect(screen.getByText('Müdür Bey')).toBeInTheDocument()
    expect(screen.queryByText('Ayşe Çamaşır')).not.toBeInTheDocument()
  })

  it('oturum kapatma doğru jti ile istek atar', async () => {
    renderWithProviders(<SessionsPage />)
    await screen.findByText('Unutulmuş Tablet')

    // "Unutulmuş Tablet" satırındaki düğme — kart sırasına bağlı kalmamak için
    // önce o kartı filtreleyip tek düğme bırakıyoruz.
    fireEvent.click(screen.getByRole('button', { name: 'Sessiz' }))
    fireEvent.click(screen.getByRole('button', { name: 'Oturumu kapat' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/system/sessions/jti-unutulmus'))
  })
})
