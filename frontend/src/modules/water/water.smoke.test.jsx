import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

const PRODUCTS = [
  { id: 1, name: 'Damacana', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36, is_active: 1, min_level: 0, brand_id: 1, brand_name: 'MİLA SU', is_returnable: 1 },
  { id: 2, name: '0.5 L', unit_label: 'koli', units_per_case: 1, cases_per_pallet: 140, is_active: 1, min_level: 0, brand_id: 1, brand_name: 'MİLA SU', is_returnable: 0 },
]

const DAILY_ROWS = [
  {
    id: 9,
    type: 'out',
    move_date: '2026-07-01',
    created_at: '2026-07-01 08:15:00',
    zone_id: 1,
    zone_name: 'OTC Kamp AlanÄ±',
    product_id: 1,
    product_name: 'Damacana',
    brand_name: 'MÄ°LA SU',
    unit_label: 'damacana',
    units_per_case: 1,
    cases_per_pallet: 36,
    input_qty: 91,
    input_unit: 'adet',
    qty_base: 91,
    qty_human: '91 damacana',
    source_waybills: 'IRS-001: 91',
    created_by_name: 'KampÃ¼s MÃ¼dÃ¼rÃ¼',
  },
]

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url, config = {}) => {
      const p = config.params || {}
      if (url === '/water/summary') return Promise.resolve({ data: {
        stock: [{ product_id: 2, name: '0.5 L', unit_label: 'koli', total_in: 280, total_out: 5, balance: 275, balance_human: '1 palet 135 koli', min_level: 0, low: false }],
        zones: [{ zone_id: 1, zone_name: 'OTC Kamp AlanÄ±', product_id: 1, product_name: 'Damacana', total_out: 91 }],
        daily: [{ move_date: '2026-07-01', in_base: 280, out_base: 91 }],
        totals: { period_in: 280, period_out: 91, balance: 275, low_count: 0, period_return: 10, outstanding: 90 },
        deposit: [{ product_id: 1, name: 'Damacana', brand_name: 'MİLA SU', unit_label: 'damacana', total_in: 100, total_return: 10, period_return: 10, outstanding: 90 }],
        group: 'day',
      } })
      if (url === '/water/pivot') return Promise.resolve({ data: {
        from: p.from, to: p.to,
        brands: [{ brand_id: 1, brand_name: 'MİLA SU', product_ids: [1, 2] }],
        columns: [
          { product_id: 1, name: 'Damacana', unit_label: 'damacana', brand_id: 1, brand_name: 'MİLA SU', units_per_case: 1, cases_per_pallet: 36 },
          { product_id: 2, name: '0.5 L', unit_label: 'koli', brand_id: 1, brand_name: 'MİLA SU', units_per_case: 1, cases_per_pallet: 140 },
        ],
        rows: [{ zone_id: 1, zone_name: 'OTC Kamp Alanı', cells: { 1: { base: 91, human: '91 damacana' } }, total_base: 91 }],
        colTotals: { 1: { base: 91, human: '2 palet 19 damacana' }, 2: { base: 0, human: '0 koli' } },
        grandTotal: 91,
      } })
      if (url === '/water/movements' && p.type === 'in') return Promise.resolve({ data: [
        { id: 5, product_id: 1, product_name: 'Damacana', brand_name: 'MİLA SU', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36, qty_base: 290 },
      ] })
      if (url === '/water/movements' && p.type === 'out' && (p.zone_id || p.from === '2026-07-01')) return Promise.resolve({ data: DAILY_ROWS })
      if (url === '/water/movements') return Promise.resolve({ data: [] })
      if (url === '/water/products') return Promise.resolve({ data: PRODUCTS })
      if (url === '/water/zones') return Promise.resolve({ data: [{ id: 1, name: 'OTC Kamp Alanı', code: 'OTC' }] })
      if (url === '/water/returns') return Promise.resolve({ data: [] })
      if (url === '/water/brands') return Promise.resolve({ data: [{ id: 1, name: 'MİLA SU' }] })
      if (url === '/water/pending') return Promise.resolve({ data: {
        date: '2026-07-09',
        rows: [{ movement_id: 9, move_date: '2026-07-03', zone_name: 'OTC Kamp Alanı', product_name: 'Damacana', brand_name: 'MİLA SU',
          qty_base: 20, allocated_base: 5, unallocated_base: 15, waiting_days: 6, source_waybills: 'IRS-1: 5',
          qty_human: '20 damacana', allocated_human: '5 damacana', unallocated_human: '15 damacana', severity: 'overdue' }],
        totals: { count: 1, overdue: 1, unallocated_base: 15 },
      } })
      if (url === '/water/reconciliation') return Promise.resolve({ data: {
        month: '2026-07', locked: false, closure: null,
        reasons: [{ key: 'fire_kirik', label: 'Fire / kırık' }, { key: 'sayim_farki', label: 'Sayım farkı' }],
        rows: [{ product_id: 1, product_name: 'Damacana', brand_name: 'MİLA SU', unit_label: 'damacana',
          opening_base: 100, month_in: 50, month_out: 30, month_return: 0, system_base: 120,
          counted_base: null, diff_base: null, reason: null, status: 'pending',
          opening_human: '100 damacana', month_in_human: '50 damacana', month_out_human: '30 damacana',
          month_return_human: '0 damacana', system_human: '120 damacana', counted_human: null, diff_human: null }],
        totals: { products: 1, counted: 0, pending: 1, mismatch: 0, system_base: 120 },
      } })
      if (url === '/water/alerts') return Promise.resolve({ data: {
        date: '2026-07-09', month: '2026-07',
        summary: { pending: 1, negative: 1, over: 0, low: 0, idle_zones: 1, total: 3 },
        pending_waybill: [{ product_id: 1, product_name: 'Damacana', count: 2, unallocated_base: 5, unallocated_human: '5 damacana', oldest_date: '2026-07-05', waiting_days: 4 }],
        negative_stock: [{ product_id: 2, product_name: '0.5 L', balance: -10, balance_human: '-10 koli', deficit_human: '10 koli' }],
        over_distributed: [],
        low_stock: [],
        idle_zones: [{ zone_id: 2, zone_name: 'Boş Bölge' }],
      } })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({ data: { ids: [1], count: 1 } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import WaterPage from './WaterPage.jsx'

describe('WaterPage tek-ekran pano smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pano: KPI + INDEX matris + dağıtım yeri satırı gösterir', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText('INDEX — DAĞITIM YERİ MATRİSİ')).toBeInTheDocument()
    expect(screen.getByText('Ay Dağıtım')).toBeInTheDocument()
    expect((await screen.findAllByText('OTC Kamp Alanı')).length).toBeGreaterThan(0)
    expect(screen.getByTestId('water-board')).toBeInTheDocument()
    expect(screen.getByLabelText('Dağıtım yeri ara')).toBeInTheDocument()
    expect(screen.getByLabelText('Sırala')).toBeInTheDocument()
    expect(screen.getByText(/Tüm Markalar/)).toBeInTheDocument()
    // dağıtım yeri toplamı (91) matriste
    expect((await screen.findAllByText('91')).length).toBeGreaterThan(0)
  })

  it('dağıtım yeri satırı tıklanınca dağıtım geçmişi modalı açılır', async () => {
    renderWithProviders(<WaterPage />)
    const zoneButtons = await screen.findAllByText('OTC Kamp Alanı')
    fireEvent.click(zoneButtons[0])
    expect(await screen.findByText(/DAĞITIM GEÇMİŞİ/)).toBeInTheDocument()
    expect(screen.getByText('Tüm geçmiş')).toBeInTheDocument()
  })

  it('gelen tır ve boş iade panelleri render olur', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText(/GELEN TIR/)).toBeInTheDocument()
    expect(screen.getByText('BOŞ İADE — DEPOZİTO')).toBeInTheDocument()
    // depozito kartı (dolaşımda 90)
    expect((await screen.findAllByText('90')).length).toBeGreaterThan(0)
  })

  it('uyarı merkezi bandı kartları gösterir ve tıklanınca detay açılır', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText('BUGÜN YAPILACAKLAR')).toBeInTheDocument()
    // benzersiz kart etiketi (KPI şeridiyle çakışmaz)
    const pendingCard = await screen.findByText('İrsaliye Bekleyen')
    fireEvent.click(pendingCard)
    // detay listesinde bekleyen dağıtım satırı görünür
    expect(await screen.findByText(/Damacana — 5 damacana \(2 kayıt, 4 gün\)/)).toBeInTheDocument()
  })

  it('ay kapanışı paneli açılınca uyuşturma satırı + sistem kalanı gösterir', async () => {
    renderWithProviders(<WaterPage />)
    const title = await screen.findByText(/AY KAPANIŞI/)
    const panel = title.closest('.panel')
    fireEvent.click(within(panel).getByText('▼ Aç')) // panel varsayılan kapalı
    expect(await within(panel).findByText('120')).toBeInTheDocument() // sistem kalanı = 100 + 50 - 30
    expect(within(panel).getByLabelText('Damacana sayım')).toBeInTheDocument()
  })

  it('irsaliye bekleyenler paneli bekleyen dağıtımı ve gecikmeyi listeler', async () => {
    renderWithProviders(<WaterPage />)
    const title = await screen.findByText(/İRSALİYE BEKLEYEN DAĞITIMLAR/)
    const panel = title.closest('.panel')
    fireEvent.click(within(panel).getByText('▼ Aç'))
    expect(await within(panel).findByText('OTC Kamp Alanı')).toBeInTheDocument()
    expect(within(panel).getByText('6g')).toBeInTheDocument() // 6 gündür bekliyor
    expect(within(panel).getByText('IRS-1: 5')).toBeInTheDocument() // kısmi eşleşen irsaliye
  })

  it('Ayarlar modalı dağıtım yerlerini açar, Metinden modalı açılır', async () => {
    renderWithProviders(<WaterPage />)
    fireEvent.click(await screen.findByText('⚙ Ayarlar'))
    expect(await screen.findByText('📍 Dağıtım Yerleri')).toBeInTheDocument()
    fireEvent.click(screen.getByText('✕ Kapat'))
    fireEvent.click(screen.getByText('📝 Metinden'))
    expect(await screen.findByText('METİNDEN DAĞITIM')).toBeInTheDocument()
  })
})

describe('WaterPage gunluk defter smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gun karti tiklaninca gunluk dagitim defteri acilir', async () => {
    renderWithProviders(<WaterPage />)
    fireEvent.click(await screen.findByTestId('water-day-2026-07-01'))
    expect(await screen.findByText(/DEFTER/)).toBeInTheDocument()
    expect(screen.getByText('IRS-001: 91')).toBeInTheDocument()
    expect(screen.getByText('08:15')).toBeInTheDocument()
  })
})
