import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

const summaryRows = [
  {
    id: 1, block: 'M1', floor: 1, room_no: '101', room_status: 'active',
    capacity: 6, active_beds: 6,
    total_tasks: 5, cleaned_count: 4, skipped_count: 1,
    fault_count: 2, open_faults: 1,
    photo_count: 3, last_cleaned_at: '2026-06-11 09:15:00',
  },
  {
    id: 2, block: 'M1', floor: 1, room_no: '102', room_status: 'active',
    capacity: 6, active_beds: 6,
    total_tasks: 5, cleaned_count: 0, skipped_count: 0,
    fault_count: 0, open_faults: 0,
    photo_count: 0, last_cleaned_at: null,
  },
]

const detailData = {
  room: { id: 1, block: 'M1', room_no: '101', floor: 1, status: 'active', capacity: 6, active_beds: 6 },
  occupants: [{ full_name: 'Ali Veli', company: 'X İnşaat', bed_no: 1 }],
  pastOccupants: [{ full_name: 'Eski Sakin', company: 'Y Ltd', bed_no: 2, assigned_at: '2026-06-01', check_out_at: '2026-06-09 10:00:00' }],
  cleanings: [{
    id: 9, type: 'cleaning', area: 'M1 Oda 101',
    scheduled_at: '2026-06-11 06:00:00', completed_at: '2026-06-11 06:30:00',
    skipped: 0, skip_reason: null, checklist: null,
    photo_url: '/uploads/kanit.jpg', verified_by_qr: 0,
    completed_by: null, worker_name: 'Temizlik Personeli',
  }],
  faults: [],
}

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => Promise.resolve({
      data: url.includes('/room-history/room/') ? detailData : summaryRows,
    })),
  },
}))

import RoomHistoryPage from './RoomHistoryPage.jsx'

describe('room-history/RoomHistoryPage smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('özet tablo foto sayısı + son temizlik kolonları ve takip filtreleriyle render eder', async () => {
    renderWithProviders(<RoomHistoryPage />)
    expect(await screen.findByText('ODA RAPOR TABLOSU')).toBeInTheDocument()
    // Takip hızlı filtreleri (chip metni label + ayrı sayaç span'ı)
    expect(await screen.findByText(/⚠ AÇIK ARIZA/)).toBeInTheDocument()
    expect(screen.getByText(/✗ TEMİZLİK YOK/)).toBeInTheDocument()
    // Foto kanıt kolonu — 101'de 3 foto
    expect(screen.getByText('📷 3')).toBeInTheDocument()
    // Son temizlik kolonu başlığı (sıralanabilir)
    expect(screen.getByText('Son Temizlik')).toBeInTheDocument()
  })

  it('TEMİZLİK YOK filtresi temizlenmemiş odayı ayıklar', async () => {
    renderWithProviders(<RoomHistoryPage />)
    const chip = (await screen.findByText(/✗ TEMİZLİK YOK/)).closest('button')
    fireEvent.click(chip)
    // 101 temiz (fotolu) — filtrelenince kaybolur; temizlenmemiş 102 kalır
    expect(screen.queryByText('📷 3')).not.toBeInTheDocument()
    expect(screen.getByText('102')).toBeInTheDocument()
  })

  it('oda arama kutusu "m1 101" eşleşmeyen odayı gizler', async () => {
    renderWithProviders(<RoomHistoryPage />)
    await screen.findByText(/✗ TEMİZLİK YOK/)
    fireEvent.change(screen.getByLabelText('Oda ara'), { target: { value: 'm1 101' } })
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.queryByText('102')).not.toBeInTheDocument()
  })

  it('oda detayı: günlük şerit + foto galerisi + ayrılan sakinler + kiosk personeli', async () => {
    renderWithProviders(<RoomHistoryPage />)
    const row = (await screen.findByText('📷 3')).closest('tr')
    fireEvent.click(row)
    expect(await screen.findByText(/GÜNLÜK TEMİZLİK — SON/)).toBeInTheDocument()
    expect(screen.getByText('FOTO KANITLARI')).toBeInTheDocument()
    expect(screen.getByText(/AYRILANLAR — SON/)).toBeInTheDocument()
    expect(screen.getByText('Eski Sakin')).toBeInTheDocument()
    // Kiosk personeli (worker_name) timeline'da görünür
    expect(screen.getByText('Temizlik Personeli')).toBeInTheDocument()
  })

  it('galerideki fotoğraf tıklanınca lightbox açılır', async () => {
    renderWithProviders(<RoomHistoryPage />)
    const row = (await screen.findByText('📷 3')).closest('tr')
    fireEvent.click(row)
    await screen.findByText('FOTO KANITLARI')
    fireEvent.click(screen.getAllByAltText(/🧹/)[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Lightbox tıklayınca kapanır
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
