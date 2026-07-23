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

// Panel üç ayrı uç nokta çağırır — her biri kendi şeklini döndürmeli.
const products = [
  { id: 10, name: 'Bardak Su', unit_label: 'koli', brand_name: 'MİLA SU', units_per_case: 1, cases_per_pallet: 66 },
  { id: 11, name: 'Damacana', unit_label: 'adet', brand_name: 'AVRİL', units_per_case: 1, cases_per_pallet: 36 },
]
const returns = [
  { id: 1, move_date: '2026-07-06', product_name: 'Damacana', brand_name: 'AVRİL', qty_base: 864, unit_label: 'adet', cases_per_pallet: 36 },
]

const routeMock = (overrides = {}) => (url) => {
  if (url === '/water/products') return Promise.resolve({ data: overrides.products ?? products })
  if (url === '/water/returns') return Promise.resolve({ data: overrides.returns ?? returns })
  return Promise.resolve({ data: overrides.report ?? report })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(routeMock())
})

describe('DistributionBreakdownPanel', () => {
  it('panel kapalıyken veri çekmez, açılınca INDEX düzenini marka bantlarıyla kurar', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(api.get).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Aç/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: /OSMANGAZİ/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /FPU GOE/ })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/water/report/accounting', expect.objectContaining({
      params: { from: '2026-07-01', to: '2026-07-02', sections: 'matrix,days' },
    }))
    // Excel düzeni: marka bantları + ürün sütunları + palet lejantı + iade bloğu
    expect(screen.getByText('MİLA SU')).toBeInTheDocument()
    expect(screen.getByText('AVRİL')).toBeInTheDocument()
    expect(screen.getByText('AYLIK GELEN TIR — GÜN × ÜRÜN')).toBeInTheDocument()
    expect(screen.getByText('PALET ÇEVRİMLERİ')).toBeInTheDocument()
    expect(screen.getByText(/1 palet = 66 koli/)).toBeInTheDocument()
    expect(screen.getByText(/TESLİM EDİLEN AVRİL BOŞ KAP/)).toBeInTheDocument()
    expect(screen.getAllByText('GENEL TOPLAM').length).toBeGreaterThan(0)
  })

  it('INDEX: firma adına tıklayınca gün tablosu, güne tıklayınca ürün kırılımı açılır', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /Aç/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /OSMANGAZİ/ })).toBeInTheDocument())

    // 1. seviye — firma adı (Excel'deki mavi hücre)
    expect(screen.queryByText(/01\.07 Çar/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /OSMANGAZİ/ }))
    expect(await screen.findByText(/01\.07 Çar/)).toBeInTheDocument()

    // 2. seviye — gün
    expect(screen.queryByText(/sabah teslim/)).not.toBeInTheDocument()
    await user.click(screen.getByText(/01\.07 Çar/))
    expect(await screen.findByText(/sabah teslim/)).toBeInTheDocument()
    expect(screen.getByText(/Vardiya/)).toBeInTheDocument()

    // Tekrar tıklayınca kapanır
    await user.click(screen.getByText(/01\.07 Çar/))
    await waitFor(() => expect(screen.queryByText(/sabah teslim/)).not.toBeInTheDocument())
  })

  it('liste görünümünde arama dağıtım yerlerini filtreler', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /Aç/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Liste görünümü/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Liste görünümü/ }))

    expect(await screen.findByText('OSMANGAZİ')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Dağıtım yeri ara…'), 'fpu')
    await waitFor(() => expect(screen.queryByText('OSMANGAZİ')).not.toBeInTheDocument())
    expect(screen.getByText('FPU GOE')).toBeInTheDocument()
  })

  it('kayıt yoksa bilgilendirme gösterir, indirme butonları çıkmaz', async () => {
    api.get.mockImplementation(routeMock({
      report: { daily: [], detail: { columns: [], rows: [], product_rows: [], days: [], column_totals: [], grand_total: 0 } },
    }))
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
    await waitFor(() => expect(screen.getByRole('button', { name: /OSMANGAZİ/ })).toBeInTheDocument())

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
