import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RoomPortalPage from './RoomPortalPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const roomPortal = {
  portal_status: 'active',
  location: { type: 'room', block: 'M1', floor: 1, area_code: null, display_name: 'M1 Oda 101' },
  actions: {
    fault: { enabled: true, pin_required: true },
    laundry: { enabled: true, pin_required: false },
    cleaning: { enabled: false, pin_required: false },
    survey: { enabled: true, pin_required: false },
  },
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/r/token-123']}><Routes><Route path="/r/:token" element={<RoomPortalPage />} /></Routes></MemoryRouter>)
}

describe('RoomPortalPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    api.get.mockReset()
    api.post.mockReset()
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true)
  })

  afterEach(() => vi.restoreAllMocks())

  it('portal kapalıyken konumu gösterir ve hizmet kartlarını gizler', async () => {
    api.get.mockResolvedValue({ data: { ...roomPortal, portal_status: 'disabled', actions: Object.fromEntries(Object.keys(roomPortal.actions).map(key => [key, { enabled: false, pin_required: false }])) } })
    renderPage()
    expect(await screen.findByText('M1 Oda 101')).toBeInTheDocument()
    expect(screen.getByText('Oda hizmetleri şu anda kapalı')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Arıza bildir/ })).not.toBeInTheDocument()
  })

  it('yalnız açık hizmetleri büyük işlem kartları olarak gösterir', async () => {
    api.get.mockResolvedValue({ data: roomPortal })
    renderPage()
    expect(await screen.findByRole('button', { name: /Arıza bildir/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Çamaşır alınmasını iste/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Memnuniyet anketi/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Temizlik durumu/ })).not.toBeInTheDocument()
  })

  it('PIN zorunlu işlemde konuma bağlı oturumu sessionStorage içinde tutar', async () => {
    api.get.mockResolvedValue({ data: roomPortal })
    api.post.mockResolvedValue({ data: {
      session_token: 's'.repeat(43),
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      resident: { display_name: 'Ali P. T.' },
    } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Arıza bildir/ }))
    fireEvent.change(screen.getByLabelText('TC / Pasaport No'), { target: { value: '12345678901' } })
    fireEvent.change(screen.getByLabelText('4 haneli kalıcı PIN'), { target: { value: '2468' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula ve devam et' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/room-portal/token-123/auth', { identifier: '12345678901', pin: '2468' }))
    expect(await screen.findByText(/Ali P. T. doğrulandı/)).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem('room-portal:token-123')).session_token).toBe('s'.repeat(43))
  })

  it('PIN zorunlu işlemden vazgeçince anonim geçiş seçeneği açmaz', async () => {
    api.get.mockResolvedValue({ data: roomPortal })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Arıza bildir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(screen.getByRole('button', { name: /Arıza bildir/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anonim devam et' })).not.toBeInTheDocument()
  })

  it('ortak alan yanıtında backend tarafından kapatılan çamaşırı göstermez', async () => {
    api.get.mockResolvedValue({ data: {
      ...roomPortal,
      location: { type: 'common_area', block: 'M1', floor: 1, area_code: 'bathroom', display_name: 'M1 1. Kat Banyo' },
      actions: { ...roomPortal.actions, laundry: { enabled: false, pin_required: false } },
    } })
    renderPage()
    expect(await screen.findByText('M1 1. Kat Banyo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Çamaşır alınmasını iste/ })).not.toBeInTheDocument()
  })
})
