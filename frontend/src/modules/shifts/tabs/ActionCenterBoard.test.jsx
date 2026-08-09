import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ActionCenterBoard from './ActionCenterBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const kayit = (over = {}) => ({
  key: `k${Math.random()}`, kind: 'pending_leave', severity: 'warning', timeframe: 'today',
  date: '2026-08-10', staff_id: 1, staff_name: 'Ali Veli', title: 'Onay bekleyen izin',
  detail: 'detay', action: { label: 'Aç', route: '/shifts?tab=leaves' }, ...over,
})

const cevap = (items, summary = {}, unavailable = []) => ({ data: {
  range: {}, items, unavailable,
  summary: {
    total: items.length,
    critical: items.filter(i => i.severity === 'critical').length,
    warning: items.filter(i => i.severity === 'warning').length,
    info: items.filter(i => i.severity === 'info').length,
    overdue: items.filter(i => i.timeframe === 'overdue').length,
    today: items.filter(i => i.timeframe === 'today').length,
    future: items.filter(i => i.timeframe === 'future').length,
    ...summary,
  },
} })

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}><MemoryRouter><ActionCenterBoard /></MemoryRouter></QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Aksiyon merkezi', () => {
  it('bekleyen iş yoksa açıkça söyler', async () => {
    api.get.mockResolvedValue(cevap([]))
    ciz()
    expect(await screen.findByText('bekleyen iş yok')).toBeInTheDocument()
  })

  // "1000 kritik eksik" gibi rakamlar geçmiş/gelecek ayrılmadığı için çıkıyor.
  it('gecikmiş, bugün ve geleceği ayrı sayar', async () => {
    api.get.mockResolvedValue(cevap([
      kayit({ timeframe: 'overdue', severity: 'critical' }),
      kayit({ timeframe: 'today' }),
      kayit({ timeframe: 'future', severity: 'info' }),
      kayit({ timeframe: 'future', severity: 'info' }),
    ]))
    ciz()
    expect(await screen.findByText('1 gecikmiş')).toBeInTheDocument()
    expect(screen.getByText('1 bugün')).toBeInTheDocument()
    expect(screen.getByText('2 gelecek')).toBeInTheDocument()
  })

  it('zaman dilimine göre süzer', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue(cevap([
      kayit({ timeframe: 'overdue', severity: 'critical', staff_name: 'Gecikmis Kisi' }),
      kayit({ timeframe: 'future', severity: 'info', staff_name: 'Gelecek Kisi' }),
    ]))
    ciz()
    await screen.findByText('Gecikmis Kisi')
    await user.click(screen.getByRole('button', { name: /Gecikmiş/ }))
    expect(screen.getByText('Gecikmis Kisi')).toBeInTheDocument()
    expect(screen.queryByText('Gelecek Kisi')).not.toBeInTheDocument()
  })

  it('her kayıtta düzeltme bağlantısı var', async () => {
    api.get.mockResolvedValue(cevap([kayit()]))
    ciz()
    const bag = await screen.findByRole('link', { name: /Aç/ })
    expect(bag).toHaveAttribute('href', expect.stringContaining('tab=leaves'))
  })

  // Boş liste "sorun yok" sanılmasın.
  it('okunamayan kaynağı listenin eksik olabileceğiyle birlikte bildirir', async () => {
    api.get.mockResolvedValue(cevap([], {}, [{ source: 'overtime_requests', error: 'no such table' }]))
    ciz()
    expect(await screen.findByText(/1 kaynak okunamadı, bu liste eksik olabilir/)).toBeInTheDocument()
    expect(screen.getByText(/overtime_requests/)).toBeInTheDocument()
  })

  // Kırpma sessiz kalırsa liste tam sanılır.
  it('uzun listede kırpılanı bildirir', async () => {
    api.get.mockResolvedValue(cevap(Array.from({ length: 30 }, () => kayit())))
    ciz()
    expect(await screen.findByText(/\+5 kayıt daha/)).toBeInTheDocument()
  })

  it('uç patlarsa sebebi yazar', async () => {
    api.get.mockRejectedValue({ response: { status: 500, data: { error: 'no such table: leave_requests' } } })
    ciz()
    expect(await screen.findByText(/no such table: leave_requests/)).toBeInTheDocument()
  })
})
