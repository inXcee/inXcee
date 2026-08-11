import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import OvertimeBudgetBoard from './OvertimeBudgetBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), put: vi.fn(() => Promise.resolve({ data: {} })) },
}))

const cevap = (over = {}) => ({ data: {
  period: '2026-04',
  scope: { dept_id: null, project_id: null },
  totals: { hours: 42, records: 12, people: 5, requests: 9 },
  chain: { approved_no_record: [], record_no_request: [], record_no_approver: [], hours_mismatch: [] },
  budget: { known: false, reason: 'Bu kapsam için aylık mesai tavanı tanımlı değil', used_hours: 42 },
  person_limit: { known: false, reason: 'Kişi başına aylık tavan tanımlı değil', over: [] },
  yearly_limit: { known: true, limit_hours: 270, over: [] },
  month_end_forecast: { known: true, complete: false, elapsed_days: 10, total_days: 30, hours_so_far: 42, projected: 126 },
  fairness: { known: true, people_with_overtime: 5, median: 6, max: 20, max_to_median: 3.33 },
  top_people: [{ staff_id: 10, full_name: 'Ali Veli', hours: 20, days: 4 }],
  warnings: [],
  unavailable: [],
  ...over,
} })

function ciz(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OvertimeBudgetBoard period="2026-04" {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(cevap())
})

describe('Mesai bütçesi ve zinciri panosu', () => {
  // Tavan tanımsızken sayı uydurmak, tavan koymuş gibi davranmaktır.
  it('tavan tanımsızsa sayı yerine "tanımlı değil" yazar', async () => {
    ciz()
    expect(await screen.findByText('tanımlı değil')).toBeInTheDocument()
  })

  it('tavan varsa tüketimi ve aşımı gösterir', async () => {
    api.get.mockResolvedValue(cevap({
      budget: { known: true, limit_hours: 30, used_hours: 42, remaining_hours: -12, exceeded: true },
      warnings: ['Aylık mesai bütçesi aşıldı'],
    }))
    ciz()
    expect(await screen.findByText('42/30')).toBeInTheDocument()
    expect(screen.getByText('12 sa aşım')).toBeInTheDocument()
    expect(screen.getByText('Aylık mesai bütçesi aşıldı')).toBeInTheDocument()
  })

  it('zincir kopukluklarını başlık ve sayıyla listeler', async () => {
    api.get.mockResolvedValue(cevap({
      chain: {
        record_no_request: [{ work_date: '2026-04-05', full_name: 'Ali Veli', hours: 4 }],
        approved_no_record: [], record_no_approver: [],
        hours_mismatch: [{ work_date: '2026-04-07', full_name: 'Ayşe', approved_hours: 4, actual_hours: 8, diff: 4 }],
      },
    }))
    ciz()
    expect(await screen.findByText('ÖN ONAYI YOK (1)')).toBeInTheDocument()
    expect(screen.getByText('SAAT UYUŞMUYOR (1)')).toBeInTheDocument()
    expect(screen.getByText(/onaylı 4 → fiilî 8 \(\+4\)/)).toBeInTheDocument()
  })

  it('zincir sağlamsa başlıkta öyle der', async () => {
    ciz()
    expect(await screen.findByText(/zincir sağlam/)).toBeInTheDocument()
  })

  it('ay sonu tahminini geçen güne göre gösterir', async () => {
    ciz()
    expect(await screen.findByText('126 sa')).toBeInTheDocument()
    expect(screen.getByText('10/30 gün')).toBeInTheDocument()
  })

  it('ay kapandıysa tahmin değil gerçekleşen yazar', async () => {
    api.get.mockResolvedValue(cevap({ month_end_forecast: { known: true, complete: true, hours: 42 } }))
    ciz()
    expect(await screen.findByText('GERÇEKLEŞEN')).toBeInTheDocument()
    expect(screen.getByText('ay kapandı')).toBeInTheDocument()
  })

  // Ölçülemeyen kaynak gizlenirse boş sonuç "mesai yok" sanılır.
  it('okunamayan kaynağı uyarı olarak gösterir', async () => {
    api.get.mockResolvedValue(cevap({ unavailable: [{ source: 'overtime_requests', error: 'no such table' }] }))
    ciz()
    expect(await screen.findByText(/overtime_requests/)).toBeInTheDocument()
  })

  it('yönetici olmayana tavan belirleme çıkmaz', async () => {
    ciz()
    await screen.findByText('tanımlı değil')
    expect(screen.queryByText(/Tavan belirle/)).not.toBeInTheDocument()
  })

  it('yönetici tavanı kaydedebilir', async () => {
    ciz({ isManager: true })
    await userEvent.click(await screen.findByText(/Tavan belirle/))
    await userEvent.type(screen.getByLabelText('Aylık toplam tavan (saat)'), '120')
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(api.put).toHaveBeenCalledWith('/shifts/overtime-budgets', expect.objectContaining({
      scope: 'global', monthly_hours: 120,
    }))
  })

  it('hata durumunda sebebi ve tekrar denemeyi gösterir', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Geçersiz dönem (YYYY-AA)' } } })
    ciz()
    expect(await screen.findByText(/Geçersiz dönem/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})
