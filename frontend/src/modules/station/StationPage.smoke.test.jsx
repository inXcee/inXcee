import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StationPage from './StationPage.jsx'

const stationCfg = { id: 1, name: 'Ana Giriş', station_type: 'entry', location: null, is_active: 1, capture_photo: 0 }

function mockFetch({ meOk = true } = {}) {
  global.fetch = vi.fn((url) => {
    const u = String(url)
    if (u.includes('/api/stations/me')) {
      return meOk
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(stationCfg) })
        : Promise.reject(new TypeError('network'))
    }
    if (u.includes('/my-events')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([
        { id: 5, result: 'ok', event_type: 'entry', scanned_at: '2026-06-11 08:00:00', holder_name: 'Ali Veli' },
      ]) })
    }
    if (u.includes('/search-holders')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([
        { id: 7, holder_type: 'staff', full_name: 'Ayşe Test', sub: 'Temizlik' },
      ]) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
  })
}

describe('station/StationPage smoke', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.setItem('yys_station_key', 'ST-test')
  })

  it('boşta ekran: istasyon adı + saat + son okutmalar listesi', async () => {
    mockFetch()
    render(<StationPage />)
    expect(await screen.findByText(/Ana Giriş/)).toBeInTheDocument()
    expect(screen.getByText('KARTINIZI OKUTUN')).toBeInTheDocument()
    expect(await screen.findByText('SON OKUTMALAR')).toBeInTheDocument()
    expect(screen.getByText('Ali Veli')).toBeInTheDocument()
  })

  it('ağ hatasında anahtar SİLİNMEZ, yeniden bağlanma ekranı çıkar', async () => {
    mockFetch({ meOk: false })
    render(<StationPage />)
    expect(await screen.findByText(/Sunucuya ulaşılamıyor/)).toBeInTheDocument()
    // Kritik: anahtar localStorage'da kalmalı (eskiden siliniyordu)
    expect(localStorage.getItem('yys_station_key')).toBe('ST-test')
  })

  it('kartsız giriş: isimle arar, kişi listelenir', async () => {
    mockFetch()
    render(<StationPage />)
    fireEvent.click(await screen.findByText('⌨ Kartsız Giriş'))
    fireEvent.change(screen.getByPlaceholderText(/İsim ara/), { target: { value: 'ay' } })
    expect(await screen.findByText('Ayşe Test')).toBeInTheDocument()
    expect(screen.getByText('PERSONEL')).toBeInTheDocument()
  })

  it('⚙ ayarlar: istasyon değiştir + bağlantıyı kes akışı', async () => {
    mockFetch()
    render(<StationPage />)
    fireEvent.click(await screen.findByLabelText('İstasyon ayarları'))
    expect(screen.getByText('⚙ İstasyon Ayarları')).toBeInTheDocument()
    // Yeni anahtar girilmeden geç butonu pasif
    expect(screen.getByText('↔ Bu İstasyona Geç')).toBeDisabled()
    // Bağlantıyı kes → anahtar silinir, kurulum ekranına döner
    fireEvent.click(screen.getByText('Bağlantıyı Kes'))
    expect(localStorage.getItem('yys_station_key')).toBe(null)
    expect(await screen.findByText('İSTASYON KURULUMU')).toBeInTheDocument()
  })
})
