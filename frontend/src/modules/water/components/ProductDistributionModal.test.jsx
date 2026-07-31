import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import api from '../../../shared/api/client.js'
import ProductDistributionModal from './ProductDistributionModal.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn() },
}))

const REPORT = {
  product: { id: 7, name: '0.33 L Şişe Su', brand_name: 'Mila' },
  from: '2026-07-01',
  to: '2026-07-31',
  totals: {
    total_base: 432, total_human: '36 koli', day_count: 2, zone_count: 3,
    record_count: 5, daily_avg_base: 216, daily_avg_human: '18 koli',
    first_date: '2026-07-18', last_date: '2026-07-20',
  },
  days: [
    {
      date: '2026-07-20', total_base: 300, total_human: '25 koli',
      zones: [
        { zone_id: 1, zone_name: 'Yemekhane', qty_base: 240, qty_human: '20 koli', record_count: 2 },
        { zone_id: 2, zone_name: 'Şantiye Ofis', qty_base: 60, qty_human: '5 koli', record_count: 1 },
      ],
    },
    {
      date: '2026-07-18', total_base: 132, total_human: '11 koli',
      zones: [{ zone_id: 3, zone_name: 'Revir', qty_base: 132, qty_human: '11 koli', record_count: 2 }],
    },
  ],
  zones: [
    {
      zone_id: 1, zone_name: 'Yemekhane', total_base: 240, total_human: '20 koli',
      share_pct: 55.6, day_count: 1, last_date: '2026-07-20',
      days: [{ date: '2026-07-20', qty_base: 240, qty_human: '20 koli' }],
    },
    {
      zone_id: 3, zone_name: 'Revir', total_base: 132, total_human: '11 koli',
      share_pct: 30.6, day_count: 1, last_date: '2026-07-18',
      days: [{ date: '2026-07-18', qty_base: 132, qty_human: '11 koli' }],
    },
    {
      zone_id: 2, zone_name: 'Şantiye Ofis', total_base: 60, total_human: '5 koli',
      share_pct: 13.9, day_count: 1, last_date: '2026-07-20',
      days: [{ date: '2026-07-20', qty_base: 60, qty_human: '5 koli' }],
    },
  ],
}

const PRODUCT = { product_id: 7, name: '0.33 L Şişe Su', brand_name: 'Mila' }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: REPORT })
})

function render() {
  return renderWithProviders(
    <ProductDistributionModal product={PRODUCT} from="2026-07-01" to="2026-07-31" label="Temmuz 2026" onClose={() => {}} />
  )
}

describe('ProductDistributionModal', () => {
  it('seçili ay için ürünün dağıtım ucunu çağırır', async () => {
    render()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/water/products/7/distribution',
      { params: { from: '2026-07-01', to: '2026-07-31' } },
    ))
  })

  it('KPI şeridi toplam, ortalama ve yer sayısını gösterir', async () => {
    render()
    await waitFor(() => expect(screen.getByText('36 koli')).toBeInTheDocument())
    expect(screen.getByText('18 koli')).toBeInTheDocument()
    // Tarih hem KPI'da hem "en yoğun gün" kartında geçebilir
    expect(screen.getAllByText('2026-07-20').length).toBeGreaterThan(0)
  })

  it('varsayılan Gün → Yer görünümünde her günün yerleri listelenir', async () => {
    render()
    await waitFor(() => expect(screen.getAllByText(/Yemekhane/).length).toBeGreaterThan(0))
    expect(screen.getByText(/Şantiye Ofis/)).toBeInTheDocument()
    expect(screen.getByText(/Revir/)).toBeInTheDocument()
  })

  it('Yer → Gün görünümünde satır açılınca günler görünür', async () => {
    render()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yer → Gün' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Yer → Gün' }))

    // Pay sütunu yer bazlı görünümde çıkar
    expect(screen.getByText('%55,6')).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    const zoneRow = rows.find(row => row.textContent.includes('Yemekhane'))
    fireEvent.click(zoneRow)
    expect(screen.getAllByText('2026-07-20').length).toBeGreaterThan(0)
  })

  it('Gün × Yer matrisi gün satırı ve yer sütunu üretir', async () => {
    render()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gün × Yer' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Gün × Yer' }))

    const headers = screen.getAllByRole('columnheader').map(cell => cell.textContent)
    expect(headers).toContain('Yemekhane')
    expect(headers).toContain('TOPLAM')
  })

  it('"Tüm geçmiş" seçilince dönem parametresi gönderilmez', async () => {
    render()
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Tüm geçmiş' }))
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(
      '/water/products/7/distribution',
      { params: {} },
    ))
  })

  it('dağıtım yoksa açık mesaj gösterir', async () => {
    api.get.mockResolvedValue({ data: { ...REPORT, days: [], zones: [], totals: {} } })
    render()
    await waitFor(() => expect(screen.getByText(/bu üründen dağıtım yapılmamış/i)).toBeInTheDocument())
  })

  it('istek hata verirse panel çökmez, hata gösterir', async () => {
    api.get.mockRejectedValue(new Error('net'))
    render()
    await waitFor(() => expect(screen.getByText(/Dağıtım dökümü alınamadı/)).toBeInTheDocument())
  })
})
