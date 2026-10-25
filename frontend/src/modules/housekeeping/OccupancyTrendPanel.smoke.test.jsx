import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import api from '../../shared/api/client.js'
import OccupancyTrendPanel from './OccupancyTrendPanel.jsx'
import EveningSummaryCard from './EveningSummaryCard.jsx'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

// Doluluk trendi (günlük anlık görüntü, bugün canlı) ve Hermes akşam özetinin web önizlemesi.
const point = (date, pct, extra = {}) => ({
  date, pct, captured: pct !== null, live: false, occupied: pct === null ? null : 6, empty: pct === null ? null : 2,
  unknown: pct === null ? null : 4, coverage: pct === null ? null : 67, ...extra,
})
const trend = {
  days: 30, block: null, from: '2026-09-26', to: '2026-10-25',
  series: [point('2026-10-23', 70), point('2026-10-24', null), point('2026-10-25', 75, { live: true })],
  summary: { pct: 75, change_7d: 5, avg: 72, min: 70, max: 75, days_with_data: 2 },
}
const summary = {
  date: '2026-10-25',
  alerts: [{ code: 'cleaning_unmarked', text: '2 oda için temizlik işareti yok.' }],
  text: '🌙 Akşam saha özeti — 25.10.2026\n\n🏠 Doluluk %75',
}

beforeEach(() => {
  api.get.mockImplementation(url => Promise.resolve({ data: url.startsWith('/housekeeping/evening-summary') ? summary : trend }))
})
afterEach(() => vi.clearAllMocks())

describe('OccupancyTrendPanel', () => {
  it('özet sayılar: bugün, 7 gün farkı, ortalama, aralık, kayıtlı gün', async () => {
    renderWithProviders(<OccupancyTrendPanel />)
    expect(await screen.findByText('%75')).toBeInTheDocument()
    expect(screen.getByText('+5 puan')).toBeInTheDocument()
    expect(screen.getByText('%72')).toBeInTheDocument()
    expect(screen.getByText('%70 – %75')).toBeInTheDocument()
    expect(screen.getByText('2 / 30')).toBeInTheDocument()
    expect(screen.getByText('6 dolu · 2 boş · 4 bilinmiyor')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/housekeeping/occupancy/trend?days=30')
  })

  it('blok ve gün aralığı sorguya gider', async () => {
    renderWithProviders(<OccupancyTrendPanel />)
    await screen.findByText('%75')
    fireEvent.change(screen.getByRole('combobox', { name: 'Blok' }), { target: { value: 'M1' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/housekeeping/occupancy/trend?days=30&block=M1'))
    fireEvent.click(screen.getByRole('button', { name: '90 gün' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/housekeeping/occupancy/trend?days=90&block=M1'))
  })

  it('tek kayıtlı günde grafiğin yeni başladığını söyler', async () => {
    api.get.mockResolvedValue({ data: { ...trend, summary: { ...trend.summary, change_7d: null, days_with_data: 1 } } })
    renderWithProviders(<OccupancyTrendPanel />)
    expect(await screen.findByText(/Günlük kayıt yeni başladı/)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('EveningSummaryCard', () => {
  it('sunucunun kurduğu metni ve dikkat sayısını gösterir', async () => {
    renderWithProviders(<EveningSummaryCard />)
    expect(await screen.findByTestId('evening-summary-text')).toHaveTextContent('Akşam saha özeti — 25.10.2026')
    expect(screen.getByText('⚠ 1 dikkat satırı')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/housekeeping/evening-summary')
  })
})
