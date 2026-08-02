import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import SessionsPage from './SessionsPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
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

// Şu an içeride: unutulmuş tablet burada YOK (20 gündür sessiz).
const ACTIVE = [
  {
    principal_kind: 'staff', principal_id: 5, full_name: 'Ayşe Çamaşır',
    role: 'avs_kiosk', session_count: 2, last_seen_at: stamp(2 * 60 * 1000),
  },
  {
    principal_kind: 'user', principal_id: 1, full_name: 'Müdür Bey',
    role: 'campus_manager', session_count: 1, last_seen_at: stamp(5 * 60 * 1000),
  },
]

// Sayfa önce iskelet gösteriyor; bölüm veri gelince oluşuyor.
const aktifBolum = () => screen.findByRole('region', { name: 'Şu an içeride olanlar' })

describe('Erişim Merkezi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation(url =>
      Promise.resolve({ data: url.includes('active-users') ? ACTIVE : SESSIONS }))
    api.post.mockResolvedValue({ data: { ok: true } })
    api.delete.mockResolvedValue({ data: { ok: true } })
  })

  it('şu an içeride olanları kişi bazında cihaz sayısıyla gösterir', async () => {
    renderWithProviders(<SessionsPage />)
    const aktif = await aktifBolum()
    await waitFor(() => expect(within(aktif).getByText('Ayşe Çamaşır')).toBeInTheDocument())
    expect(within(aktif).getByText(/2 cihaz/)).toBeInTheDocument()
    // 20 gündür sessiz olan burada görünmez.
    expect(within(aktif).queryByText('Unutulmuş Tablet')).not.toBeInTheDocument()
  })

  it('kişinin tüm cihazlarını kapatır', async () => {
    renderWithProviders(<SessionsPage />)
    const aktif = await aktifBolum()
    await waitFor(() => expect(within(aktif).getByText('Ayşe Çamaşır')).toBeInTheDocument())

    fireEvent.click(within(aktif).getAllByRole('button', { name: 'Tüm cihazları kapat' })[0])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/system/sessions/revoke-all', { kind: 'staff', id: 5 },
    ))
  })

  it('askıya alma yalnız panel kullanıcısında çıkar', async () => {
    renderWithProviders(<SessionsPage />)
    const aktif = await aktifBolum()
    await waitFor(() => expect(within(aktif).getByText('Müdür Bey')).toBeInTheDocument())

    // Kiosk personeli users tablosunda değil — askı düğmesi tek olmalı.
    const askiDugmeleri = within(aktif).getAllByRole('button', { name: 'Hesabı askıya al' })
    expect(askiDugmeleri.length).toBe(1)

    fireEvent.click(askiDugmeleri[0])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/system/users/1/suspend', { reason: 'Yönetici kararı' },
    ))
  })

  it('açık oturumlarda uzun süre sessiz kalanı işaretler ve filtreler', async () => {
    renderWithProviders(<SessionsPage />)
    await screen.findByText('Unutulmuş Tablet')
    expect(screen.getByText('20 gün önce')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sessiz' }))
    expect(screen.getByText('Unutulmuş Tablet')).toBeInTheDocument()
  })

  it('tek oturum kapatma doğru jti ile istek atar', async () => {
    renderWithProviders(<SessionsPage />)
    await screen.findByText('Unutulmuş Tablet')

    fireEvent.click(screen.getByRole('button', { name: 'Sessiz' }))
    fireEvent.click(screen.getByRole('button', { name: 'Oturumu kapat' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/system/sessions/jti-unutulmus'))
  })
})
