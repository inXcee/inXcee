import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LeaveImpactPanel from './LeaveImpactPanel.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const cevap = (over = {}) => ({ data: {
  staff: { id: 10, full_name: 'Ali Veli', department_id: 1 },
  range: { start: '2026-03-02', end: '2026-03-04', days: 3 },
  leave_type: 'annual',
  balance: { applicable: true, remaining: 10, requested: 3, after: 7, sufficient: true },
  conflicting_shifts: { items: [], truncated: 0 },
  same_day_leaves: { items: [], truncated: 0 },
  coverage_loss: { items: [], truncated: 0 },
  overtime_effect: { items: [], truncated: 0 },
  replacements: { available: true, date: '2026-03-02', items: [] },
  year_end_forecast: { known: true, remaining_now: 10, this_request: 3, other_approved_future: 5, projected: 2 },
  recurring_pattern: [],
  warnings: [],
  unavailable: [],
  ...over,
} })

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LeaveImpactPanel staffId={10} start="2026-03-02" end="2026-03-04" leaveType="annual" />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(cevap())
})

describe('İzin etki analizi paneli', () => {
  it('bakiyeyi ve talepten sonrasını gösterir', async () => {
    ciz()
    expect(await screen.findByText('10 gün')).toBeInTheDocument()
    expect(screen.getByText('7 gün')).toBeInTheDocument()
  })

  // Kadro açığı onaydan sonra fark edilirse iş işten geçmiş oluyor.
  it('kadro açığını gün ve kural adıyla yazar', async () => {
    api.get.mockResolvedValue(cevap({
      coverage_loss: { items: [{ date: '2026-03-02', rule_name: 'OTC gündüz', after: 1, required: 2, missing: 1 }], truncated: 0 },
      warnings: ['1 noktada kadro asgarinin altına düşüyor'],
    }))
    ciz()
    expect(await screen.findByText(/OTC gündüz → 1\/2/)).toBeInTheDocument()
    expect(screen.getByText('1 noktada kadro asgarinin altına düşüyor')).toBeInTheDocument()
  })

  it('ezilecek vardiyaları listeler', async () => {
    api.get.mockResolvedValue(cevap({
      conflicting_shifts: { items: [{ work_date: '2026-03-03', shift_name: 'Gündüz', location_name: 'OTC' }], truncated: 0 },
    }))
    ciz()
    expect(await screen.findByText(/2026-03-03 · Gündüz · OTC/)).toBeInTheDocument()
  })

  // Kırpılan kayıt sessizce yutulursa liste tam sanılır.
  it('kırpılan kayıt sayısını söyler', async () => {
    api.get.mockResolvedValue(cevap({
      same_day_leaves: { items: [{ date: '2026-03-02', names: ['Ayşe'] }], truncated: 4 },
    }))
    ciz()
    expect(await screen.findByText('+4 kayıt daha')).toBeInTheDocument()
  })

  // Ölçülemeyen kaynak gizlenirse boş sonuç "etki yok" sanılır.
  it('okunamayan kaynağı uyarı olarak gösterir', async () => {
    api.get.mockResolvedValue(cevap({ unavailable: [{ source: 'shift_coverage_rules', error: 'no such table' }] }))
    ciz()
    expect(await screen.findByText(/shift_coverage_rules/)).toBeInTheDocument()
  })

  it('yıllık dışı türde bakiyenin ölçüt olmadığını yazar', async () => {
    api.get.mockResolvedValue(cevap({
      balance: { applicable: false, reason: 'sick türünde yıllık bakiye ölçüt değil' },
      year_end_forecast: { known: false, reason: 'Bakiye kaydı olmadan yıl sonu tahmini yapılamaz' },
    }))
    ciz()
    expect(await screen.findByText(/ölçüt değil/)).toBeInTheDocument()
  })

  it('hata durumunda sebebi ve tekrar denemeyi gösterir', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Personel bulunamadı' } } })
    ciz()
    expect(await screen.findByText(/Personel bulunamadı/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })

  it('tekrar eden örüntüyü açıklar', async () => {
    api.get.mockResolvedValue(cevap({ recurring_pattern: [{ weekday: 1, weekday_name: 'Pazartesi', count: 3 }] }))
    ciz()
    expect(await screen.findByText(/3'i Pazartesi/)).toBeInTheDocument()
  })
})
