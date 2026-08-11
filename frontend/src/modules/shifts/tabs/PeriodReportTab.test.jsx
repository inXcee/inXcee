import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PeriodReportTab from './PeriodReportTab.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const bolumler = (over = {}) => ({
  planned_vs_actual: { measurable: true, days: [], total_planned: 100, total_actual: 90, realization: 0.9, realization_note: null },
  coverage_success: { measurable: true, overall_ratio: 0.8, rule_days: 30, met_days: 24, chronically_short: [] },
  absence: { measurable: true, total_days: 4, without_reason: 1, people: [] },
  leave_ranking: { measurable: true, total_days: 5, people: [] },
  overtime_ranking: { measurable: true, total_hours: 13, people: [] },
  project_load: { measurable: true, projects: [{ project: 'FPU', person_days: 12, people: 4 }], cost_note: 'Para cinsinden maliyet hesaplanmıyor — saatlik ücret verisi sistemde tutulmuyor' },
  approval_times: { measurable: true, average_days: 4, unmeasured: 0, periods: [] },
  pre_exit_trends: { measurable: true, count: 0, people: [] },
  ...over,
})

const cevap = (over = {}) => ({ data: {
  period: '2026-04', range: { start: '2026-04-01', end: '2026-04-30' }, dept_id: null,
  sections: bolumler(over.sections), unmeasurable: over.unmeasurable || [],
} })

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PeriodReportTab departments={[{ id: 1, name: 'Temizlik' }]} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(cevap())
})

describe('Dönem raporu sekmesi', () => {
  it('planlanan/gerçekleşen ve oranı gösterir', async () => {
    ciz()
    expect(await screen.findByText('%90')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  // Oran hesaplanamadıysa 0 yazmak "hiç tutmadı" diye okunur.
  it('oran yoksa gerekçeyi yazar', async () => {
    api.get.mockResolvedValue(cevap({ sections: {
      planned_vs_actual: { measurable: true, days: [], total_planned: 0, total_actual: 0, realization: null, realization_note: 'Bu dönemde hiç plan girilmemiş — gerçekleşme oranı hesaplanamaz' },
    } }))
    ciz()
    expect(await screen.findByText(/hiç plan girilmemiş/)).toBeInTheDocument()
  })

  // Ölçülemeyen bölüm sıfır göstermemeli.
  it('ölçülemeyen bölümü sebebiyle işaretler', async () => {
    api.get.mockResolvedValue(cevap({
      sections: { coverage_success: { measurable: false, reason: 'Hiç kapsama kuralı tanımlı değil' } },
      unmeasurable: [{ section: 'coverage_success', reason: 'Hiç kapsama kuralı tanımlı değil' }],
    }))
    ciz()
    expect(await screen.findByText(/1 bölüm ölçülemedi/)).toBeInTheDocument()
    expect(screen.getByText(/Hiç kapsama kuralı tanımlı değil/)).toBeInTheDocument()
  })

  it('sürekli açık kalan kuralı gösterir', async () => {
    api.get.mockResolvedValue(cevap({ sections: {
      coverage_success: { measurable: true, overall_ratio: 0.5, rule_days: 30, met_days: 15,
        chronically_short: [{ rule_id: 1, rule_name: 'OTC gündüz', short_days: 15, ratio: 0.5 }] },
    } }))
    ciz()
    expect(await screen.findByText('OTC gündüz')).toBeInTheDocument()
    expect(screen.getByText(/15 gün eksik/)).toBeInTheDocument()
  })

  // Para cinsinden maliyet uydurulmadığı ekranda da yazmalı.
  it('maliyet notunu taşır', async () => {
    ciz()
    expect(await screen.findByText(/saatlik ücret verisi sistemde tutulmuyor/)).toBeInTheDocument()
  })

  it('dönemde ayrılan yoksa açıkça söyler', async () => {
    ciz()
    expect(await screen.findByText('Bu dönemde işten ayrılan yok.')).toBeInTheDocument()
  })

  it('onay süresi ölçülemediyse sayı uydurmaz', async () => {
    api.get.mockResolvedValue(cevap({ sections: {
      approval_times: { measurable: true, average_days: null, unmeasured: 2, periods: [] },
    } }))
    ciz()
    expect(await screen.findByText('ölçülemedi')).toBeInTheDocument()
  })

  it('hata durumunda sebebi ve tekrar denemeyi gösterir', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Geçersiz dönem (YYYY-AA)' } } })
    ciz()
    expect(await screen.findByText(/Geçersiz dönem/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})
