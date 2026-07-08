import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

const PRODUCTS = [
  { id: 1, name: 'Damacana', unit_label: 'damacana', units_per_case: 1, cases_per_pallet: 36, is_active: 1, min_level: 0, brand_id: 1, brand_name: 'MİLA SU', is_returnable: 1 },
  { id: 2, name: '0.5 L', unit_label: 'koli', units_per_case: 1, cases_per_pallet: 140, is_active: 1, min_level: 0, brand_id: 1, brand_name: 'MİLA SU', is_returnable: 0 },
]

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url, config = {}) => {
      const p = config.params || {}
      if (url === '/water/summary') return Promise.resolve({ data: {
        stock: [{ product_id: 2, name: '0.5 L', unit_label: 'koli', total_in: 280, total_out: 5, balance: 275, balance_human: '1 palet 135 koli', min_level: 0, low: false }],
        zones: [], daily: [],
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
      if (url === '/water/movements') return Promise.resolve({ data: [] })
      if (url === '/water/products') return Promise.resolve({ data: PRODUCTS })
      if (url === '/water/zones') return Promise.resolve({ data: [{ id: 1, name: 'OTC Kamp Alanı', code: 'OTC' }] })
      if (url === '/water/returns') return Promise.resolve({ data: [] })
      if (url === '/water/brands') return Promise.resolve({ data: [{ id: 1, name: 'MİLA SU' }] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({ data: { ids: [1], count: 1 } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import WaterPage from './WaterPage.jsx'

describe('WaterPage tek-ekran pano smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pano: KPI + INDEX matris + firma satırı gösterir', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText('INDEX — FİRMA DAĞITIM MATRİSİ')).toBeInTheDocument()
    expect(screen.getByText('Ay Dağıtım')).toBeInTheDocument()
    expect((await screen.findAllByText('OTC Kamp Alanı')).length).toBeGreaterThan(0)
    expect(screen.getByTestId('water-board')).toBeInTheDocument()
    // firma toplamı (91) matriste
    expect((await screen.findAllByText('91')).length).toBeGreaterThan(0)
  })

  it('gelen tır ve boş iade panelleri render olur', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText(/GELEN TIR/)).toBeInTheDocument()
    expect(screen.getByText('BOŞ İADE — DEPOZİTO')).toBeInTheDocument()
    // depozito kartı (dolaşımda 90)
    expect((await screen.findAllByText('90')).length).toBeGreaterThan(0)
  })

  it('Ayarlar modalı firmaları açar, Metinden modalı açılır', async () => {
    renderWithProviders(<WaterPage />)
    fireEvent.click(await screen.findByText('⚙ Ayarlar'))
    expect(await screen.findByText('📍 Firmalar')).toBeInTheDocument()
    fireEvent.click(screen.getByText('✕ Kapat'))
    fireEvent.click(screen.getByText('📝 Metinden'))
    expect(await screen.findByText('METİNDEN DAĞITIM')).toBeInTheDocument()
  })
})
