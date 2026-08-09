import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ReadinessBoard from './ReadinessBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const madde = (key, status, extra = {}) => ({
  key, label: key, status, count: 1, total: 10, detail: `${key} detayı`,
  action: { label: 'Düzelt', route: `/shifts?fix=${key}` }, ...extra,
})

const cevap = (items, summary) => ({ data: { items, summary } })

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}><MemoryRouter><ReadinessBoard /></MemoryRouter></QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Hazırlık durumu', () => {
  it('kritik varken kendiliğinden açılır', async () => {
    api.get.mockResolvedValue(cevap(
      [madde('staff_role', 'critical'), madde('projects', 'ok')],
      { ok: 1, warning: 0, critical: 1, unknown: 0, total: 2, ready: false },
    ))
    ciz()
    expect(await screen.findByText('1 kritik')).toBeInTheDocument()
    expect(screen.getByLabelText('Hazırlık durumu')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('staff_role detayı')).toBeInTheDocument()
  })

  // Her şey yolundayken tek satır kalmalı, ekranı doldurmamalı.
  it('sistem hazırken kapalı gelir', async () => {
    api.get.mockResolvedValue(cevap(
      [madde('projects', 'ok')],
      { ok: 1, warning: 0, critical: 0, unknown: 0, total: 1, ready: true },
    ))
    ciz()
    expect(await screen.findByText('sistem hazır')).toBeInTheDocument()
    expect(screen.getByLabelText('Hazırlık durumu')).toHaveAttribute('aria-expanded', 'false')
  })

  // "Bakamadım" ile "sorun yok" karışırsa bu katmanın anlamı kalmaz.
  it('ölçülemeyen kontrolleri ayrıca sayar ve açılır', async () => {
    api.get.mockResolvedValue(cevap(
      [madde('holidays', 'unknown'), madde('projects', 'ok')],
      { ok: 1, warning: 0, critical: 0, unknown: 1, total: 2, ready: false },
    ))
    ciz()
    expect(await screen.findByText('1 ölçülemedi')).toBeInTheDocument()
    expect(screen.queryByText('sistem hazır')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Hazırlık durumu')).toHaveAttribute('aria-expanded', 'true')
  })

  it('kritik önce, tamam en sonda sıralanır', async () => {
    api.get.mockResolvedValue(cevap(
      [madde('a_ok', 'ok'), madde('b_warning', 'warning'), madde('c_critical', 'critical')],
      { ok: 1, warning: 1, critical: 1, unknown: 0, total: 3, ready: false },
    ))
    const { container } = ciz()
    await screen.findByText('a_ok detayı')
    const metin = container.textContent
    expect(metin.indexOf('c_critical')).toBeLessThan(metin.indexOf('b_warning'))
    expect(metin.indexOf('b_warning')).toBeLessThan(metin.indexOf('a_ok'))
  })

  // Sorunu gösterip çözümü aratmak, bu katmanın çözmeye çalıştığı şeyin ta kendisi.
  it('sorunlu satırda düzeltme bağlantısı var, tamam satırında yok', async () => {
    api.get.mockResolvedValue(cevap(
      [madde('staff_role', 'critical'), madde('projects', 'ok')],
      { ok: 1, warning: 0, critical: 1, unknown: 0, total: 2, ready: false },
    ))
    ciz()
    await screen.findByText('staff_role detayı')
    const baglantilar = screen.getAllByRole('link')
    expect(baglantilar).toHaveLength(1)
    expect(baglantilar[0]).toHaveAttribute('href', expect.stringContaining('fix=staff_role'))
  })

  it('uç patlarsa sebebi yazar ve tekrar denemeyi sunar', async () => {
    api.get.mockRejectedValue({ response: { status: 500, data: { error: 'no such table: holidays' } } })
    ciz()
    expect(await screen.findByText(/no such table: holidays/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })

  it('açılıp kapanabilir', async () => {
    api.get.mockResolvedValue(cevap(
      [madde('projects', 'ok')],
      { ok: 1, warning: 0, critical: 0, unknown: 0, total: 1, ready: true },
    ))
    const user = userEvent.setup()
    ciz()
    const dugme = await screen.findByLabelText('Hazırlık durumu')
    await user.click(dugme)
    await waitFor(() => expect(dugme).toHaveAttribute('aria-expanded', 'true'))
  })
})
