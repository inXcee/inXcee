import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PickupRequestsPanel, { bekleme } from './PickupRequestsPanel.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

// Sakin QR'dan çamaşır istedi; bu panel olmadan çamaşırhane onu hiç görmüyordu.
// Testlerin tuttuğu: talep görünür, kapatılabilir, ve kapatmanın teslim
// OLMADIĞI ekranda yazılı.

const TALEP = {
  id: 7, display_name: 'M1 Oda 101', resident_name: 'Ahmet Y.',
  note: 'İki torba var', bag_estimate: 2, request_count: 1,
  created_at: '2026-08-17 18:00:00',
}

const ciz = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><PickupRequestsPanel /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { available: true, items: [TALEP] } })
  api.post.mockResolvedValue({ data: { id: 7, status: 'collected' } })
})

describe('bekleme süresi', () => {
  const t = (iso, simdi) => bekleme(iso, new Date(simdi).getTime()).metin

  it('dakika, saat ve gün olarak yazar', () => {
    expect(t('2026-08-17 18:00:00', '2026-08-17T18:30:00Z')).toBe('30 dk önce')
    expect(t('2026-08-17 18:00:00', '2026-08-17T21:00:00Z')).toBe('3 saat önce')
    expect(t('2026-08-15 18:00:00', '2026-08-17T18:00:00Z')).toBe('2 gün önce')
  })

  // Uzun bekleyen talep göze çarpmalı.
  it('8 saatten uzun beklemeyi acil işaretler', () => {
    expect(bekleme('2026-08-17 06:00:00', new Date('2026-08-17T15:00:00Z').getTime()).acil).toBe(true)
    expect(bekleme('2026-08-17 14:00:00', new Date('2026-08-17T15:00:00Z').getTime()).acil).toBe(false)
  })

  it('tarih yoksa uydurmaz', () => {
    expect(bekleme(null).metin).toBe('zaman bilinmiyor')
    expect(bekleme('bozuk').metin).toBe('zaman bilinmiyor')
  })
})

describe('çamaşır talebi paneli', () => {
  it('talebi oda, sakin, torba ve notuyla gösterir', async () => {
    ciz()
    expect(await screen.findByText('M1 Oda 101')).toBeInTheDocument()
    expect(screen.getByText('Ahmet Y.')).toBeInTheDocument()
    expect(screen.getByText('~2 torba')).toBeInTheDocument()
    expect(screen.getByText(/İki torba var/)).toBeInTheDocument()
  })

  it('tekrarlanan isteği sayısıyla gösterir', async () => {
    api.get.mockResolvedValue({ data: { available: true, items: [{ ...TALEP, request_count: 4 }] } })
    ciz()
    expect(await screen.findByText('4 kez istendi')).toBeInTheDocument()
  })

  it('torba alındı denince talebi kapatır', async () => {
    ciz()
    await userEvent.click(await screen.findByRole('button', { name: 'Torbayı aldım' }))
    expect(api.post).toHaveBeenCalledWith('/laundry/pickup-requests/7/close',
      expect.objectContaining({ status: 'collected' }))
  })

  // İptal sessizce olmamalı: gerekçe zorunlu.
  it('iptal gerekçesiz gönderilemez', async () => {
    ciz()
    await userEvent.click(await screen.findByRole('button', { name: 'İptal' }))
    const gonder = screen.getByRole('button', { name: 'İptal et' })
    expect(gonder).toBeDisabled()

    await userEvent.type(screen.getByLabelText('İptal gerekçesi'), 'Sakin vazgeçti')
    expect(gonder).toBeEnabled()
    await userEvent.click(gonder)
    expect(api.post).toHaveBeenCalledWith('/laundry/pickup-requests/7/close',
      { status: 'cancelled', reason: 'Sakin vazgeçti' })
  })

  // Talep kapatmak torbayı teslim almak DEĞİLDİR; ekran bunu yazmalı.
  it('kapatmanın teslim olmadığını ve kapatmazsa yeni talep açılamayacağını yazar', async () => {
    ciz()
    expect(await screen.findByText(/torbayı teslim almak DEĞİLDİR/)).toBeInTheDocument()
    expect(screen.getByText(/o oda yeni talep açamaz/)).toBeInTheDocument()
  })

  it('talep yoksa yer kaplamaz', async () => {
    api.get.mockResolvedValue({ data: { available: true, items: [] } })
    const { container } = ciz()
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container.querySelector('section')).toBeNull()
  })

  // Okunamayan liste "talep yok" diye okunmamalı.
  it('liste okunamazsa gerekçeyi gösterir', async () => {
    api.get.mockResolvedValue({ data: { available: false, reason: 'Çamaşır talepleri okunamadı: no such table', items: [] } })
    ciz()
    expect(await screen.findByText(/Çamaşır talepleri okunamadı/)).toBeInTheDocument()
  })

  it('kapatma başarısızsa hatayı gösterir', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Açık talep bulunamadı' } } })
    ciz()
    await userEvent.click(await screen.findByRole('button', { name: 'Torbayı aldım' }))
    expect(await screen.findByText('Açık talep bulunamadı')).toBeInTheDocument()
  })
})
