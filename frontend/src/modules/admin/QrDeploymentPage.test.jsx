import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QrDeploymentPage from './QrDeploymentPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

// Faz 7 ekranı. Buradaki testlerin tuttuğu asıl şey: ekran "bilinmiyor"u
// "kurulmadı"ya çevirmesin ve ölçülemeyen oranı yüzde diye göstermesin.

const VARSAYILAN_RAPOR = {
  available: true,
  items: [
    { location_id: 1, display_name: 'M1 Oda 101', block: 'M1', state: 'printed', label: 'Basıldı, asıldığı kaydedilmedi', actionable: true, serial: 'RQ-M1-101-A7K3' },
    { location_id: 2, display_name: 'M1 Oda 102', block: 'M1', state: 'unknown', label: 'Fiziksel durum kaydedilmemiş', actionable: false },
    { location_id: 3, display_name: 'M1 Oda 103', block: 'M1', state: 'verified', label: 'Yerinde doğrulandı', actionable: false },
  ],
  summary: {
    total: 3, unknown: 1, qr_missing: 0, printed: 1, installed: 0, verified: 1,
    damaged: 0, stale: 0, removed: 0, known: 2, coverage_measurable: true,
    coverage_note: '1 konumun etiket durumu hiç kaydedilmemiş; oran bunlar hariç hesaplandı.',
  },
}

const cevaplar = ({ rapor, partiler, bayat, uyusmazlik } = {}) => url => {
  if (url.includes('label-templates')) {
    return Promise.resolve({ data: {
      default_template: 'a4_8',
      templates: [{ key: 'a4_8', label: 'A4 8’li etiket', per_page: 8 }, { key: 'a4_12', label: 'A4 12’li kompakt', per_page: 12 }],
    } })
  }
  if (url.includes('print-batches')) return Promise.resolve({ data: partiler ?? { available: true, items: [] } })
  if (url.includes('deployments/stale')) return Promise.resolve({ data: bayat ?? { available: true, items: [] } })
  if (url.includes('deployments/mismatches')) return Promise.resolve({ data: uyusmazlik ?? { available: true, items: [] } })
  if (url.includes('deployments')) return Promise.resolve({ data: rapor ?? VARSAYILAN_RAPOR })
  return Promise.resolve({ data: {} })
}

const ciz = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><QrDeploymentPage /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(cevaplar())
  api.post.mockResolvedValue({ data: {} })
})

describe('QR basım ve kurulum ekranı', () => {
  it('açılır ve durum kovalarını ayrı ayrı gösterir', async () => {
    ciz()
    expect(screen.getByRole('heading', { name: 'QR BASIM VE SAHA KURULUMU' })).toBeInTheDocument()
    // Başlık statik; veriye bağlı bir öğeyi beklemek gerekir yoksa test
    // istekler dönmeden geçer.
    expect(await screen.findByText('Yerinde doğrulandı')).toBeInTheDocument()
    expect(screen.getByText('Durum bilinmiyor')).toBeInTheDocument()
  })

  // ASIL KURAL: "bilinmiyor" kovası "kurulmadı" diye okunmamalı.
  it('bilinmiyor kovasının kurulmadı anlamına gelmediğini yazar', async () => {
    ciz()
    expect(await screen.findByText(/kurulmadı DEMEK DEĞİL/)).toBeInTheDocument()
    expect(screen.getByText(/oran bunlar hariç hesaplandı/)).toBeInTheDocument()
  })

  it('oranı paydasıyla birlikte gösterir', async () => {
    ciz()
    // (doğrulanan 1 + asılan 0) / bilinen 2
    expect(await screen.findByText('50% (1/2 bilinen konum)')).toBeInTheDocument()
  })

  // Hiçbir kayıt yokken "%0" yazmak "hiçbiri asılmadı" demektir; oysa bilinen
  // tek şey kaydın olmadığıdır.
  it('hiçbir konumun durumu kayıtlı değilse yüzde göstermez', async () => {
    api.get.mockImplementation(cevaplar({
      rapor: {
        available: true,
        items: [],
        summary: { total: 1078, unknown: 1078, known: 0, coverage_note: '1078 konumun etiket durumu hiç kaydedilmemiş; oran bunlar hariç hesaplandı.' },
      },
    }))
    ciz()
    expect(await screen.findByText(/Oran ölçülemiyor/)).toBeInTheDocument()
    expect(screen.queryByText(/bilinen konum\)/)).not.toBeInTheDocument()
  })

  it('rapor okunamazsa gerekçeyi gösterir', async () => {
    api.get.mockImplementation(cevaplar({
      rapor: { available: false, reason: 'Kurulum raporu okunamadı: no such table', items: [], summary: null },
    }))
    ciz()
    expect(await screen.findByText(/Kurulum raporu okunamadı/)).toBeInTheDocument()
  })

  it('sahada iş gerektirenleri listeler, bilinmeyeni listeye almaz', async () => {
    ciz()
    expect(await screen.findByText(/Sahada iş gerektiren 1 konum/)).toBeInTheDocument()
    expect(screen.getByText('RQ-M1-101-A7K3')).toBeInTheDocument()
  })

  // Y bloklarda kat sayısı 1, 2 ya da 3 olabilir; blok config'inden gelmeli.
  it('kat listesini seçilen bloğun kat sayısından üretir', async () => {
    ciz()
    const blokSecici = await screen.findByRole('combobox', { name: /BLOK/i })
    await userEvent.selectOptions(blokSecici, 'E')          // E bloğu 3 katlı
    const katSecici = screen.getByRole('combobox', { name: /KAT/i })
    expect(katSecici.querySelectorAll('option')).toHaveLength(4)   // "Tüm katlar" + 3
  })

  it('parti açıldığında PDF ister', async () => {
    api.post.mockResolvedValue({ data: { id: 7, batch_no: 'BP-00007', label_count: 24, page_count: 3 } })
    ciz()
    await userEvent.click(await screen.findByRole('button', { name: /Parti aç ve PDF indir/ }))
    expect(api.post).toHaveBeenCalledWith('/location-portal/print-batches',
      expect.objectContaining({ template: 'a4_8' }))
    expect(await screen.findByText(/BP-00007/)).toBeInTheDocument()
  })

  it('bayat etiketleri yeniden basım başlığı altında gösterir', async () => {
    api.get.mockImplementation(cevaplar({
      bayat: { available: true, items: [{ location_id: 4, display_name: 'S2 Oda 204', serial: 'RQ-S2-204-K9PM', batch_no: 'BP-00001' }] },
    }))
    ciz()
    expect(await screen.findByRole('heading', { name: /YENİDEN BASILMASI GEREKENLER/ })).toBeInTheDocument()
    expect(screen.getByText('RQ-S2-204-K9PM')).toBeInTheDocument()
  })

  it('açık uyuşmazlığı yanlış kapı diliyle anlatır', async () => {
    api.get.mockImplementation(cevaplar({
      uyusmazlik: { available: true, items: [
        { id: 3, reason: 'location_mismatch', expected_name: 'M1 Oda 101', scanned_name: 'M1 Oda 102' },
      ] },
    }))
    ciz()
    expect(await screen.findByText(/M1 Oda 101 yerinde M1 Oda 102 etiketi bulundu/)).toBeInTheDocument()
  })
})
