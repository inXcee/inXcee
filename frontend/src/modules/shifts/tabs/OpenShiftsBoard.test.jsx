import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import OpenShiftsBoard from './OpenShiftsBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))

const GUNLER = ['2026-05-11', '2026-05-12', '2026-05-13']

const ilan = (over = {}) => ({
  id: 1, work_date: '2026-05-13', shift_name: 'Gündüz', location_name: 'OTC Lokal',
  dept_name: 'Temizlik', role_name: null, slots: 1, selected_count: 0, applicant_count: 2,
  note: null, status: 'open', ...over,
})

const aday = (over = {}) => ({
  id: 1, staff_id: 10, full_name: 'Ali Veli', dept_name: 'Temizlik', role_name: 'Meydancı',
  status: 'applied',
  suitability: { eligible: true, fully_verified: true, blockers: [], warnings: [], unknown: [], checks: [] },
  ...over,
})

const cevaplar = ({ ilanlar = [ilan()], adaylar = [aday()] } = {}) => url => {
  if (url.includes('/applicants')) return Promise.resolve({ data: { open_shift: ilan(), items: adaylar } })
  return Promise.resolve({ data: { items: ilanlar } })
}

function ciz(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpenShiftsBoard weekDays={GUNLER} shiftDefs={[{ id: 1, name: 'Gündüz' }]} {...props} />
    </QueryClientProvider>
  )
}

const adaylariAc = async () => userEvent.click(await screen.findByRole('button', { name: 'Adaylar' }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(cevaplar())
})

describe('Açık vardiya panosu', () => {
  it('ilanları gün, vardiya ve başvuru sayısıyla listeler', async () => {
    ciz()
    expect(await screen.findByText(/Gündüz · OTC Lokal · Temizlik/)).toBeInTheDocument()
    expect(screen.getByText('0/1 · 2 başvuru')).toBeInTheDocument()
  })

  it('ilan yoksa açıkça söyler', async () => {
    api.get.mockImplementation(cevaplar({ ilanlar: [] }))
    ciz()
    expect(await screen.findByText('Bu hafta açık vardiya ilanı yok.')).toBeInTheDocument()
  })

  it('adayı uygunluk rozetiyle gösterir', async () => {
    ciz()
    await adaylariAc()
    expect(await screen.findByText('Ali Veli')).toBeInTheDocument()
    expect(screen.getByText('uygun')).toBeInTheDocument()
  })

  // Engelli aday sessizce "uygun" görünmemeli.
  it('engelli adayda engel sayısını ve "yine de seç" der', async () => {
    api.get.mockImplementation(cevaplar({
      adaylar: [aday({
        suitability: {
          eligible: false, fully_verified: true, blockers: ['on_leave'], warnings: [], unknown: [],
          checks: [{ key: 'on_leave', label: 'İzin', status: 'block', detail: 'annual izni' }],
        },
      })],
    }))
    ciz({ canManage: true })
    await adaylariAc()
    expect(await screen.findByText('1 engel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yine de seç' })).toBeInTheDocument()
  })

  // Ölçülemeyen kontrol "uygun" sayılmaz.
  it('ölçülemeyen kontrolü uygun göstermez', async () => {
    api.get.mockImplementation(cevaplar({
      adaylar: [aday({
        suitability: { eligible: true, fully_verified: false, blockers: [], warnings: [], unknown: ['rest_period'], checks: [] },
      })],
    }))
    ciz()
    await adaylariAc()
    expect(await screen.findByText('1 ölçülemedi')).toBeInTheDocument()
  })

  it('uygun adayı seçince çizelgeye yazma isteği gider', async () => {
    ciz({ canManage: true })
    await adaylariAc()
    await userEvent.click(await screen.findByRole('button', { name: 'Seç' }))
    expect(api.post).toHaveBeenCalledWith('/shifts/open-shifts/1/select', { staff_id: 10, force: false })
  })

  it('yetkisiz kullanıcıya seçim ve ilan çıkmaz', async () => {
    ciz()
    await adaylariAc()
    await screen.findByText('Ali Veli')
    expect(screen.queryByRole('button', { name: 'Seç' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Yeni ilan/)).not.toBeInTheDocument()
  })

  it('yönetici ilan açabilir', async () => {
    ciz({ canManage: true })
    await userEvent.click(await screen.findByText(/Yeni ilan/))
    await userEvent.selectOptions(screen.getByLabelText('İlan günü'), '2026-05-13')
    await userEvent.selectOptions(screen.getByLabelText('İlan vardiyası'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'İlan Et' }))
    expect(api.post).toHaveBeenCalledWith('/shifts/open-shifts', expect.objectContaining({
      work_date: '2026-05-13', shift_def_id: 1, slots: 1,
    }))
  })

  it('seçilmiş ve seçilmemiş adayı ayırır', async () => {
    api.get.mockImplementation(cevaplar({
      adaylar: [aday({ id: 1, status: 'selected' }), aday({ id: 2, staff_id: 11, full_name: 'Ayşe', status: 'not_selected' })],
    }))
    ciz({ canManage: true })
    await adaylariAc()
    expect(await screen.findByText('SEÇİLDİ')).toBeInTheDocument()
    expect(screen.getByText('seçilmedi')).toBeInTheDocument()
  })

  it('hata durumunda sebebi ve tekrar denemeyi gösterir', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Geçersiz tarih' } } })
    ciz()
    expect(await screen.findByText(/Geçersiz tarih/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})
