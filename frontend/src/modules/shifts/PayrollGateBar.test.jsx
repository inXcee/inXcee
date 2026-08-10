import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import PayrollGateBar from './PayrollGateBar.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const kontrol = (key, status, detail = 'detay') => ({
  key, label: key, status, count: 1, detail, action: { label: 'Düzelt', route: `/shifts?fix=${key}` },
})
const cevap = checks => ({ data: {
  month: '2026-06', checks,
  ready: checks.every(c => c.status === 'ok'),
  blocking: checks.filter(c => c.status === 'blocked').map(c => c.key),
  unknown: checks.filter(c => c.status === 'unknown').map(c => c.key),
} })

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}><MemoryRouter><PayrollGateBar month="2026-06" /></MemoryRouter></QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Bordro kapısı şeridi', () => {
  it('hazır dönemde kesin dosya üretilebilir der', async () => {
    api.get.mockResolvedValue(cevap([kontrol('period_lock', 'ok')]))
    ciz()
    expect(await screen.findByText(/DÖNEM KESİN BORDROYA HAZIR/)).toBeInTheDocument()
  })

  // Engeli göstermek yetmez; NEDEN engellendiği ve nereden düzeltileceği yazmalı.
  it('engelleri sebebiyle ve düzeltme bağlantısıyla listeler', async () => {
    api.get.mockResolvedValue(cevap([
      kontrol('unclosed_days', 'blocked', '12 gün hâlâ "planlı"'),
      kontrol('period_lock', 'ok'),
    ]))
    ciz()
    expect(await screen.findByText(/DÖNEM HAZIR DEĞİL/)).toBeInTheDocument()
    expect(screen.getByText(/12 gün hâlâ "planlı"/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Düzelt/ })).toHaveAttribute('href', expect.stringContaining('unclosed_days'))
  })

  // "Ölçemedim" ile "sorun yok" aynı sayılırsa kapının anlamı kalmaz.
  it('ölçülemeyen kontrolde de hazır demez', async () => {
    api.get.mockResolvedValue(cevap([kontrol('period_lock', 'unknown', 'Ölçülemedi')]))
    ciz()
    expect(await screen.findByText(/DÖNEM HAZIR DEĞİL/)).toBeInTheDocument()
    expect(screen.getByText('Ölçülemedi')).toBeInTheDocument()
  })

  it('uç patlarsa sebebi yazar', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'no such table: period_locks' } } })
    ciz()
    expect(await screen.findByText(/no such table: period_locks/)).toBeInTheDocument()
  })
})
