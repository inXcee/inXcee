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

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: summaryRows })),
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
    // Son temizlik kolonu başlığı
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
})
