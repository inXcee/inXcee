import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url === '/water/summary') return Promise.resolve({ data: {
        stock: [{ product_id: 1, name: '0.5 L Şişe Su', unit_label: 'şişe', total_in: 1680, total_out: 60, balance: 1620, balance_human: '1 palet 65 koli' }],
        zones: [{ zone_id: 1, zone_name: 'A Blok', product_id: 1, product_name: '0.5 L Şişe Su', total_out: 60, out_human: '5 koli' }],
        daily: [{ move_date: '2026-07-01', in_base: 1680, out_base: 0 }, { move_date: '2026-07-02', in_base: 0, out_base: 60 }],
        totals: { total_in: 1680, total_out: 60, balance: 1620 },
      } })
      if (url === '/water/products') return Promise.resolve({ data: [{ id: 1, name: '0.5 L Şişe Su', unit_label: 'şişe', units_per_case: 12, cases_per_pallet: 70, is_active: 1 }] })
      if (url === '/water/zones') return Promise.resolve({ data: [{ id: 1, name: 'A Blok', code: 'A' }] })
      if (url === '/water/movements') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({ data: { id: 1 } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

// recharts ResponsiveContainer jsdom'da 0 boyut uyarısı verir; testte sorun değil
import WaterPage from './WaterPage.jsx'

describe('WaterPage smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('özet sekmesi stok ve KPI gösterir', async () => {
    renderWithProviders(<WaterPage />)
    expect(await screen.findByText('Toplam Giriş')).toBeInTheDocument()
    expect((await screen.findAllByText('0.5 L Şişe Su')).length).toBeGreaterThan(0)
    expect(screen.getByText('1 palet 65 koli')).toBeInTheDocument()
    expect(screen.getByText('📍 A Blok')).toBeInTheDocument()
  })

  it('sekmeler arası geçiş çalışır (Giriş formu)', async () => {
    renderWithProviders(<WaterPage />)
    fireEvent.click(screen.getByText('📥 Giriş (İrsaliye)'))
    expect(await screen.findByText('YENİ GİRİŞ')).toBeInTheDocument()
    expect(screen.getByText('İrsaliye No')).toBeInTheDocument()
  })
})
