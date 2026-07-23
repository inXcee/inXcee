import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DistributionBreakdownPanel from './DistributionBreakdownPanel.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn() },
}))

const report = {
  from: '2026-07-01',
  to: '2026-07-02',
  daily: [
    { key: '2026-07-01', label: '01.07 Çar' },
    { key: '2026-07-02', label: '02.07 Per' },
  ],
  detail: {
    grouped: false,
    columns: [
      { key: '2026-07-01', label: '01', full: '01.07.2026' },
      { key: '2026-07-02', label: '02', full: '02.07.2026' },
    ],
    column_totals: [300, 160],
    grand_total: 460,
    rows: [
      {
        zone_id: 1,
        zone_name: 'OSMANGAZİ',
        total: 300,
        share: 65.2,
        cells: [300, 0],
        products: [{ product_id: 10, name: 'Bardak Su', brand_name: 'MİLA SU', total: 300, cells: [300, 0] }],
      },
      {
        zone_id: 2,
        zone_name: 'FPU GOE',
        total: 160,
        share: 34.8,
        cells: [0, 160],
        products: [{ product_id: 10, name: 'Bardak Su', brand_name: 'MİLA SU', total: 160, cells: [0, 160] }],
      },
    ],
    product_rows: [
      { product_id: 10, name: 'Bardak Su', brand_name: 'MİLA SU', unit_label: 'koli', total: 460, share: 100, cells: [300, 160] },
    ],
    days: [
      {
        key: '2026-07-01',
        label: '01.07.2026',
        weekday: 'Çarşamba',
        zones: [{
          zone_id: 1,
          zone_name: 'OSMANGAZİ',
          total: 300,
          lines: [{
            product_id: 10, product_name: 'Bardak Su', brand_name: 'MİLA SU',
            qty_base: 300, qty_human: '300 koli', note: 'sabah teslim', created_by_name: 'Vardiya',
          }],
        }],
      },
    ],
  },
}

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DistributionBreakdownPanel from="2026-07-01" to="2026-07-02" label="Temmuz 2026" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: report })
})

describe('DistributionBreakdownPanel', () => {
  it('panel kapalıyken veri çekmez, açılınca tüm yerleri listeler', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(api.get).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Aç/ }))

    await waitFor(() => expect(screen.getByText('OSMANGAZİ')).toBeInTheDocument())
    expect(screen.getByText('FPU GOE')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/water/report/accounting', expect.objectContaining({
      params: { from: '2026-07-01', to: '2026-07-02', sections: 'matrix,days' },
    }))
    // Toplamlar üstte, her zaman görünür
    expect(screen.getByText('GENEL TOPLAM')).toBeInTheDocument()
  })

  it('yere tıklayınca gün tablosu, güne tıklayınca ürün kırılımı açılır', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /Aç/ }))
    await waitFor(() => expect(screen.getByText('OSMANGAZİ')).toBeInTheDocument())

    // 1. seviye — yer
    expect(screen.queryByText('01.07 Çar')).not.toBeInTheDocument()
    await user.click(screen.getByText('OSMANGAZİ'))
    expect(await screen.findByText('01.07 Çar')).toBeInTheDocument()

    // 2. seviye — gün
    expect(screen.queryByText(/sabah teslim/)).not.toBeInTheDocument()
    await user.click(screen.getByText('01.07 Çar'))
    expect(await screen.findByText(/sabah teslim/)).toBeInTheDocument()
    expect(screen.getByText(/Vardiya/)).toBeInTheDocument()

    // Tekrar tıklayınca kapanır
    await user.click(screen.getByText('01.07 Çar'))
    await waitFor(() => expect(screen.queryByText(/sabah teslim/)).not.toBeInTheDocument())
  })

  it('arama dağıtım yerlerini filtreler', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /Aç/ }))
    await waitFor(() => expect(screen.getByText('OSMANGAZİ')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Dağıtım yeri ara…'), 'fpu')
    await waitFor(() => expect(screen.queryByText('OSMANGAZİ')).not.toBeInTheDocument())
    expect(screen.getByText('FPU GOE')).toBeInTheDocument()
  })

  it('kayıt yoksa bilgilendirme gösterir, indirme butonları çıkmaz', async () => {
    api.get.mockResolvedValue({
      data: { daily: [], detail: { columns: [], rows: [], product_rows: [], days: [], column_totals: [], grand_total: 0 } },
    })
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /Aç/ }))

    expect(await screen.findByText('Bu aralıkta dağıtım kaydı yok.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Excel/ })).not.toBeInTheDocument()
  })

  it('PDF butonu panelin içeriğiyle aynı bölümleri ister', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /Aç/ }))
    await waitFor(() => expect(screen.getByText('OSMANGAZİ')).toBeInTheDocument())

    api.get.mockResolvedValue({ data: new Blob(['pdf']) })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
    globalThis.URL.revokeObjectURL = vi.fn()

    await user.click(screen.getByRole('button', { name: /PDF/ }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/water/report/accounting.pdf', expect.objectContaining({
      params: { from: '2026-07-01', to: '2026-07-02', sections: 'matrix,zones' },
      responseType: 'blob',
    })))
    anchorClick.mockRestore()
  })
})
