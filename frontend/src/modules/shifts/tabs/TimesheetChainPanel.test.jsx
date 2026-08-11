import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TimesheetChainPanel from './TimesheetChainPanel.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const halka = (key, label, status, detail) => ({ key, label, status, detail, data: null })

const zincir = (over = {}) => ({ data: {
  staff: { id: 10, full_name: 'Ali Veli', is_active: true },
  date: '2026-06-15',
  links: [
    halka('schedule', 'Planlanan vardiya', 'ok', 'Gündüz · 08-16 · OTC Lokal'),
    halka('evidence', 'Giriş/çıkış kanıtı', 'unavailable', 'Turnike/kart kaydı sisteme hiç akmıyor — bu halka doğrulanamıyor'),
    halka('leave', 'İzin / rapor', 'ok', 'Bu gün için izin/rapor kaydı yok'),
    halka('overtime', 'Fazla mesai', 'ok', 'Bu gün için mesai kaydı yok'),
    halka('code', 'Puantaj kodu', 'missing', 'Bu güne puantaj kodu atanmamış — bordroya nasıl yansıyacağı belirsiz'),
    halka('approval', 'Dönem onayı', 'ok', '2026-06 · durum: approved'),
  ],
  gaps: ['evidence', 'code'],
  explainable: false,
  ...over,
} })

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TimesheetChainPanel staffId={10} date="2026-06-15" />
    </QueryClientProvider>
  )
}

const ac = async () => userEvent.click(screen.getByRole('button', { name: /neden böyle görünüyor/i }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(zincir())
})

describe('Puantaj açıklanabilirlik zinciri paneli', () => {
  // Hücre düzenleyici her sağ tıkta açılıyor; kapalı panel istek atmamalı.
  it('kapalıyken istek atmaz, açılınca atar', async () => {
    ciz()
    expect(api.get).not.toHaveBeenCalled()
    await ac()
    expect(api.get).toHaveBeenCalledWith('/shifts/timesheet-chain', {
      params: { staff_id: 10, date: '2026-06-15' },
    })
  })

  it('altı halkayı da etiketiyle listeler', async () => {
    ciz()
    await ac()
    for (const ad of ['Planlanan vardiya', 'Giriş/çıkış kanıtı', 'İzin / rapor', 'Fazla mesai', 'Puantaj kodu', 'Dönem onayı']) {
      expect(await screen.findByText(ad)).toBeInTheDocument()
    }
  })

  // Kopuk halkanın gerekçesi gizlenirse zinciri göstermenin anlamı kalmaz.
  it('kopuk halkanın gerekçesini yazar ve sayısını başlıkta söyler', async () => {
    ciz()
    await ac()
    expect(await screen.findByText(/2 halka kopuk/)).toBeInTheDocument()
    expect(screen.getByText(/puantaj kodu atanmamış/)).toBeInTheDocument()
  })

  // "Ölçülemiyor" ile "eksik" aynı görünürse boş kaynak sorun sanılır.
  it('ölçülemeyen halkayı eksikten ayırır', async () => {
    ciz()
    await ac()
    expect(await screen.findByText('ölçülemiyor')).toBeInTheDocument()
  })

  it('zincir tamsa açıkça söyler', async () => {
    api.get.mockResolvedValue(zincir({
      links: [halka('schedule', 'Planlanan vardiya', 'ok', 'Gündüz')],
      gaps: [],
      explainable: true,
    }))
    ciz()
    await ac()
    expect(await screen.findByText(/Zincir tam/)).toBeInTheDocument()
  })

  it('hata durumunda sebebi ve tekrar denemeyi gösterir', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Personel bulunamadı' } } })
    ciz()
    await ac()
    expect(await screen.findByText(/Personel bulunamadı/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})
