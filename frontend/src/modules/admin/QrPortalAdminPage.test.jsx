import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QrPortalAdminPage from './QrPortalAdminPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}))

// Faz 6 ekranı. Tuttuğu şey: sıfırların yanında NEDEN sıfır olduğu yazsın ve
// portal, etiketi kapıda olmayan bir hâlde sessizce açılmasın.

const AYARLAR = {
  location_portal_enabled: true,
  location_portal_fault_enabled: true,
  location_portal_laundry_enabled: false,
  location_portal_cleaning_enabled: true,
  location_portal_survey_enabled: true,
  location_portal_fault_pin_required: false,
  location_portal_laundry_pin_required: false,
  location_portal_cleaning_review_pin_required: false,
}

const ANALITIK = {
  available: true,
  portal_enabled: true,
  portal_note: null,
  settings_last_changed_at: '2026-08-12 10:00:00',
  settings_history_tracked: false,
  window: { measurable: true, data_from: '2026-08-01', data_to: '2026-08-10', note: null, first_event_at: '2026-08-01 09:00:00' },
  services: [
    { key: 'fault', label: 'Arıza bildirimi', enabled: true, events: 12, note: null },
    { key: 'laundry', label: 'Çamaşır talebi', enabled: false, events: 0, note: 'Hizmet KAPALI — sıfır, kullanılmadığı anlamına gelmez' },
    { key: 'cleaning', label: 'Temizlik', enabled: true, events: 4, note: null },
    { key: 'survey', label: 'Anket', enabled: true, events: 0, note: null },
  ],
  totals: { scans: 50, fault: 12, laundry_request: 0, cleaning_complete: 4, survey: 0 },
  identity: { anonymous: 60, resident_pin: 5, worker: 1 },
  by_block: [{ block: 'M1', locations: 60, scans: 40, labels_proven: 55, labels_unknown: 5, coverage_note: '5 konumun etiket durumu kayıtsız' }],
  labels: { unknown: 5, printed: 10, installed: 25, verified: 30, damaged: 0, stale: 0, removed: 0, qr_missing: 0 },
  silence: { zero_scan_locations: 10, explained_by_label: 7, genuinely_unused: 3, measurable: true, note: 'x' },
  busiest: [{ location_id: 1, display_name: 'M1 Oda 101', block: 'M1', scans: 12 }],
  cleaning_reviews: {
    total: 9, issues: 2, followup_tasks: 2, rated_count: 7,
    rating_measurable: true, average_rating: 4.3, rating_note: null,
    by_block: [{ block: 'M1', total: 9, issues: 2, rated_count: 7, average_rating: 4.3 }],
  },
}

const cevaplar = ({ ayarlar, analitik } = {}) => url => {
  if (url.includes('settings')) return Promise.resolve({ data: ayarlar ?? AYARLAR })
  if (url.includes('analytics')) return Promise.resolve({ data: analitik ?? ANALITIK })
  return Promise.resolve({ data: {} })
}

const ciz = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><QrPortalAdminPage /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(cevaplar())
  api.put.mockResolvedValue({ data: AYARLAR })
})

describe('QR portal yönetim ekranı', () => {
  it('hizmet ve PIN anahtarlarını gösterir', async () => {
    ciz()
    expect(await screen.findByText('Arıza bildirimi')).toBeInTheDocument()
    expect(screen.getByText('Portal ana anahtarı')).toBeInTheDocument()
    expect(screen.getByText('Arıza için PIN zorunlu')).toBeInTheDocument()
  })

  it('anahtarı değiştirince kaydeder', async () => {
    ciz()
    await userEvent.click(await screen.findByRole('checkbox', { name: /Anket/ }))
    expect(api.put).toHaveBeenCalledWith('/location-portal/settings',
      { location_portal_survey_enabled: false })
  })

  // Bağlı hizmet kapalıyken PIN ayarının etkisi yok; kullanıcı "açtım ama
  // çalışmıyor" dememeli.
  it('kapalı hizmetin PIN anahtarını devre dışı bırakır ve gerekçe yazar', async () => {
    ciz()
    const pin = await screen.findByRole('checkbox', { name: /Çamaşır talebi için PIN/ })
    expect(pin).toBeDisabled()
    expect(screen.getAllByText('Bağlı hizmet kapalı — bu ayarın etkisi yok').length).toBeGreaterThan(0)
  })

  // ASIL KURAL: etiketi kapıda olmayan portal, açık olsa da ulaşılamaz.
  it('hiçbir etiket kapıda değilse açmadan önce uyarır', async () => {
    api.get.mockImplementation(cevaplar({
      analitik: { ...ANALITIK, labels: { unknown: 1078, printed: 0, installed: 0, verified: 0 } },
    }))
    ciz()
    expect(await screen.findByText(/okutabilecek kimse olmayabilir/)).toBeInTheDocument()
  })

  it('kapsama yeterliyse olumlu özet verir', async () => {
    ciz()
    expect(await screen.findByText(/55\/70 konumda etiket kapıda kayıtlı/)).toBeInTheDocument()
  })

  // Kapalı hizmetin sıfırı "kullanılmıyor" değil "kullanılamıyor" demek.
  it('kapalı hizmetin sıfırına gerekçe yazar', async () => {
    ciz()
    expect(await screen.findByText('Hizmet kapalı')).toBeInTheDocument()
  })

  it('her şey açıkken sıfırı olduğu gibi söyler', async () => {
    ciz()
    expect(await screen.findByText('Hizmet açık — kayıt yok')).toBeInTheDocument()
  })

  it('sessizliği üç parçaya ayırarak anlatır', async () => {
    ciz()
    expect(await screen.findByText(/7 tanesinde etiket kapıda değil/)).toBeInTheDocument()
  })

  it('günlük ortalamayı gerçek veri aralığına böler', async () => {
    ciz()
    expect(await screen.findByText(/günde ~5 \(10 gün\)/)).toBeInTheDocument()
  })

  // Ölçülemeyen pencerede ortalama üretmek uydurmadır.
  it('veri yoksa günlük ortalama uydurmaz', async () => {
    api.get.mockImplementation(cevaplar({
      analitik: {
        ...ANALITIK,
        window: { measurable: false, note: 'Hiç portal olayı kaydedilmemiş — portal hiç kullanılmamış ya da yeni açılmış olabilir.' },
      },
    }))
    ciz()
    expect(await screen.findByText(/günlük ortalama hesaplanamıyor/)).toBeInTheDocument()
    expect(screen.getByText(/Hiç portal olayı kaydedilmemiş/)).toBeInTheDocument()
  })

  it('portal kapalıysa sayıların geçmişe ait olduğunu gösterir', async () => {
    api.get.mockImplementation(cevaplar({
      analitik: { ...ANALITIK, portal_enabled: false, portal_note: 'Portal ana anahtarı KAPALI — QR okutan sakin hiçbir şey yapamaz; buradaki sayılar geçmişe aittir.' },
    }))
    ciz()
    expect(await screen.findByText(/buradaki sayılar geçmişe aittir/)).toBeInTheDocument()
  })

  it('analitik okunamazsa gerekçeyi gösterir', async () => {
    api.get.mockImplementation(cevaplar({
      analitik: { available: false, reason: 'Portal analitiği okunamadı: no such table' },
    }))
    ciz()
    expect(await screen.findByText(/Portal analitiği okunamadı/)).toBeInTheDocument()
  })

  it('ayar geçmişinin tutulmadığını açıkça yazar', async () => {
    ciz()
    expect(await screen.findByText(/Ayar geçmişi tutulmuyor/)).toBeInTheDocument()
  })

  it('blok kırılımında kayıtsız etiket notunu gösterir', async () => {
    ciz()
    expect(await screen.findByText('5 konumun etiket durumu kayıtsız')).toBeInTheDocument()
  })

  it('sakin temizlik puanını paydasıyla gösterir', async () => {
    ciz()
    // Ortalama hem başlıkta hem blok satırında görünür — ikisi de doğru.
    expect((await screen.findAllByText(/4\.3\/5/)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/7 puan/)).toBeInTheDocument()
    expect(screen.getByText(/2 şikayet · 2 takip görevi açıldı/)).toBeInTheDocument()
  })

  // Sıfır puandan ortalama üretmek "temizlik kötü" demek olurdu.
  it('puanlı değerlendirme yoksa ortalama göstermez', async () => {
    api.get.mockImplementation(cevaplar({
      analitik: {
        ...ANALITIK,
        cleaning_reviews: {
          total: 0, issues: 0, followup_tasks: 0, rated_count: 0,
          rating_measurable: false, average_rating: null,
          rating_note: 'Henüz puanlı değerlendirme yok — ortalama hesaplanamaz',
          by_block: [],
        },
      },
    }))
    ciz()
    expect(await screen.findByText(/ortalama hesaplanamaz/)).toBeInTheDocument()
    expect(screen.queryAllByText(/\d\/5/)).toHaveLength(0)
  })
})
