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
    sessionStorage.clear(); localStorage.clear(); api.get.mockReset(); api.post.mockReset()
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
    api.get.mockResolvedValue({ data: roomPortal }); renderPage()
    expect(await screen.findByRole('button', { name: /Arıza bildir/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Çamaşır alınmasını iste/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Memnuniyet anketi/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Temizlik durumu/ })).not.toBeInTheDocument()
  })

  it('PIN zorunlu işlemde konuma bağlı oturumu tutar ve arıza formunu açar', async () => {
    api.get.mockResolvedValue({ data: roomPortal })
    api.post.mockResolvedValue({ data: { session_token: 's'.repeat(43), expires_at: new Date(Date.now() + 600_000).toISOString(), resident: { display_name: 'Ali P. T.' } } })
    renderPage(); fireEvent.click(await screen.findByRole('button', { name: /Arıza bildir/ }))
    fireEvent.change(screen.getByLabelText('TC / Pasaport No'), { target: { value: '12345678901' } })
    fireEvent.change(screen.getByLabelText('4 haneli kalıcı PIN'), { target: { value: '2468' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula ve devam et' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/room-portal/token-123/auth', { identifier: '12345678901', pin: '2468' }))
    expect(await screen.findByText(/Ali P. T. doğrulandı/)).toBeInTheDocument()
    expect(screen.getByLabelText('Sorunu anlatın')).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem('room-portal:token-123')).session_token).toBe('s'.repeat(43))
  })

  it('PIN zorunlu işlemden vazgeçince anonim geçiş seçeneği açmaz', async () => {
    api.get.mockResolvedValue({ data: roomPortal }); renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Arıza bildir/ })); fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(screen.getByRole('button', { name: /Arıza bildir/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anonim devam et' })).not.toBeInTheDocument()
  })

  it('ortak alanda backend tarafından kapatılan çamaşırı göstermez', async () => {
    api.get.mockResolvedValue({ data: { ...roomPortal, location: { type: 'common_area', block: 'M1', floor: 1, area_code: 'bathroom', display_name: 'M1 1. Kat Banyo' }, actions: { ...roomPortal.actions, laundry: { enabled: false, pin_required: false } } } })
    renderPage(); expect(await screen.findByText('M1 1. Kat Banyo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Çamaşır alınmasını iste/ })).not.toBeInTheDocument()
  })

  it('anonim arıza formunu multipart gönderir ve sunucu makbuzunu gösterir', async () => {
    api.get.mockResolvedValue({ data: { ...roomPortal, actions: { ...roomPortal.actions, fault: { enabled: true, pin_required: false } } } })
    api.post.mockResolvedValue({ data: { receipt: 'receipt-1234567890123456', status: 'accepted', merged: false, summary: { message: 'Teknik ekibe iletildi' } } })
    renderPage(); fireEvent.click(await screen.findByRole('button', { name: /Arıza bildir/ })); fireEvent.click(screen.getByRole('button', { name: 'Anonim devam et' }))
    fireEvent.change(screen.getByLabelText('Sorunu anlatın'), { target: { value: 'Lavabo su kaçırıyor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Arıza bildirimini gönder' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, data, config] = api.post.mock.calls[0]
    expect(url).toBe('/room-portal/token-123/faults')
    expect(data).toBeInstanceOf(FormData)
    expect(data.get('description')).toBe('Lavabo su kaçırıyor')
    expect(data.get('client_request_id')).toBeTruthy()
    expect(config.headers).toEqual({})
    expect(await screen.findByText('receipt-1234567890123456')).toBeInTheDocument()
  })

  it('anket puanını ve isteğe bağlı PIN oturumunu güvenli başlıkla gönderir', async () => {
    sessionStorage.setItem('room-portal:token-123', JSON.stringify({ session_token: 'z'.repeat(43), expires_at: new Date(Date.now() + 600_000).toISOString(), resident: { display_name: 'Ayşe K.' } }))
    api.get.mockResolvedValue({ data: roomPortal })
    api.post.mockResolvedValue({ data: { receipt: 'survey-receipt-123456789', status: 'completed', summary: {} } })
    renderPage(); fireEvent.click(await screen.findByRole('button', { name: /Memnuniyet anketi/ })); fireEvent.click(screen.getByRole('button', { name: 'PIN ile devam et' }))
    fireEvent.click(screen.getByRole('button', { name: 'Genel memnuniyet: 5 puan' })); fireEvent.click(screen.getByRole('button', { name: 'Anketi gönder' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toBe('/room-portal/token-123/surveys')
    expect(api.post.mock.calls[0][1]).toMatchObject({ overall_score: 5 })
    expect(api.post.mock.calls[0][2].headers).toEqual({ 'X-Room-Portal-Session': 'z'.repeat(43) })
  })

  it('çevrimdışında anketi göndermeden yalnız cihaz taslağına kaydeder', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    api.get.mockResolvedValue({ data: roomPortal }); renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Memnuniyet anketi/ })); fireEvent.click(screen.getByRole('button', { name: 'Anonim devam et' }))
    fireEvent.click(screen.getByRole('button', { name: 'Oda: 4 puan' })); fireEvent.click(screen.getByRole('button', { name: 'Anketi gönder' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya gönderilmedi')
    expect(api.post).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('room-portal-draft:token-123:survey')).scores.room_score).toBe(4)
  })
})
