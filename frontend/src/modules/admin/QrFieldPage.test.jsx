import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QrFieldPage from './QrFieldPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
// Kamera jsdom'da yok; tarayıcı modalı ayrı test ediliyor.
vi.mock('../../shared/components/QrScannerModal.jsx', () => ({ default: () => null }))

// Saha ekranı. Tuttuğu şeyler:
//   • Kuyruk en çok iş gerektirenden başlar, doğrulanmış konum kuyruğa girmez.
//   • Yanlış kapı bir HATA değil BULGU — görevliyi suçlamayan, ne yapacağını
//     söyleyen bir mesaj çıkar ve sıradaki konuma İLERLEMEZ.
//   • Elle "asıldı" demek doğrulamanın yerini tutmaz ve ekran bunu yazar.

const RAPOR = {
  available: true,
  summary: { total: 4, unknown: 1, verified: 1, printed: 1, stale: 1, known: 3 },
  items: [
    { location_id: 1, display_name: 'M1 Oda 101', block: 'M1', floor: 1, state: 'unknown', label: 'Fiziksel durum kaydedilmemiş', actionable: false },
    { location_id: 2, display_name: 'M1 Oda 102', block: 'M1', floor: 1, state: 'stale', label: 'Bayat', actionable: true, serial: 'RQ-M1-102-A7K3' },
    { location_id: 3, display_name: 'M1 Oda 103', block: 'M1', floor: 1, state: 'verified', label: 'Yerinde doğrulandı', actionable: false },
    { location_id: 4, display_name: 'M1 Oda 104', block: 'M1', floor: 1, state: 'printed', label: 'Basıldı', actionable: true },
  ],
}

const ciz = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><QrFieldPage /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: RAPOR })
  api.post.mockResolvedValue({ data: {} })
})

describe('saha dağıtımı ekranı', () => {
  it('en çok iş gerektiren konumu sıradaki olarak gösterir', async () => {
    ciz()
    // stale > printed > unknown; doğrulanmış hiç girmez.
    expect(await screen.findByText('M1 Oda 102')).toBeInTheDocument()
    expect(screen.getByText('Bayat — yeni etiket gerekli')).toBeInTheDocument()
    expect(screen.getByText('RQ-M1-102-A7K3')).toBeInTheDocument()
  })

  it('ilerlemeyi paydasıyla ve bilinmeyen sayısıyla gösterir', async () => {
    ciz()
    expect(await screen.findByText('1/4 doğrulandı')).toBeInTheDocument()
    expect(screen.getByText(/1 konum hiç kaydedilmemiş/)).toBeInTheDocument()
  })

  it('kalan kuyruğu listeler, doğrulanmışı dışarıda bırakır', async () => {
    ciz()
    expect(await screen.findByText(/SIRADA 2 KONUM DAHA/)).toBeInTheDocument()
    expect(screen.queryByText('M1 Oda 103')).not.toBeInTheDocument()
  })

  // ASIL KURAL: yanlış kapı görevlinin hatası değil; ne yapacağını söylemeli
  // ve kesinlikle "tamam" deyip ilerlememeli.
  it('yanlış kapıda ne yapılacağını söyler ve sıradakini değiştirmez', async () => {
    api.post.mockRejectedValue({
      response: { data: { ok: false, code: 'location_mismatch', scanned: { display_name: 'M1 Oda 108' } } },
    })
    ciz()
    await userEvent.click(await screen.findByText(/Kamera çalışmıyor mu/))
    await userEvent.type(screen.getByLabelText('QR bağlantısı'), 'https://avskamp.com/r/' + 'x'.repeat(43))
    await userEvent.click(screen.getByRole('button', { name: /Yapıştırılanı doğrula/ }))

    expect(await screen.findByText('Yanlış kapıda etiket')).toBeInTheDocument()
    expect(screen.getByText(/M1 Oda 102 olmalıydı/)).toBeInTheDocument()
    expect(screen.getByText(/M1 Oda 108/)).toBeInTheDocument()
    // Sıradaki hâlâ aynı konum olmalı.
    expect(screen.getByText('M1 Oda 102')).toBeInTheDocument()
  })

  it('doğrulama başarılıysa onaylar', async () => {
    api.post.mockResolvedValue({ data: { ok: true, scanned: { display_name: 'M1 Oda 102' } } })
    ciz()
    await userEvent.click(await screen.findByText(/Kamera çalışmıyor mu/))
    await userEvent.type(screen.getByLabelText('QR bağlantısı'), 'y'.repeat(43))
    await userEvent.click(screen.getByRole('button', { name: /Yapıştırılanı doğrula/ }))
    expect(await screen.findByText(/M1 Oda 102 doğrulandı/)).toBeInTheDocument()
  })

  // Elle işaret doğrulamanın yerini tutmaz; ekran bunu açıkça yazmalı.
  it('elle işaretlemenin doğrulama sayılmadığını yazar', async () => {
    ciz()
    await userEvent.click(await screen.findByText(/Kamera çalışmıyor mu/))
    expect(screen.getByText(/çalışır hâle getirmez/)).toBeInTheDocument()
  })

  it('aktif QR olmayan konumda elle işaret sessizce başarı saymaz', async () => {
    api.get.mockResolvedValue({
      data: { ...RAPOR, items: [{ location_id: 9, display_name: 'S1 Oda 105', block: 'S1', floor: 1, state: 'unknown', actionable: false }] },
    })
    api.post.mockResolvedValue({ data: { updated: 0, skipped_no_active_qr: [9] } })
    ciz()
    await userEvent.click(await screen.findByText(/Kamera çalışmıyor mu/))
    await userEvent.click(screen.getByRole('button', { name: /Okutmadan .asıldı. işaretle/ }))
    expect(await screen.findByText('İşaretlenemedi')).toBeInTheDocument()
    expect(screen.getByText(/aktif QR kodu yok/)).toBeInTheDocument()
  })

  it('atlanan konum kuyruktan düşer ve geri alınabilir', async () => {
    ciz()
    await userEvent.click(await screen.findByRole('button', { name: /Atla/ }))
    expect(await screen.findByText('M1 Oda 104')).toBeInTheDocument()   // sıradaki değişti
  })

  it('yapılacak iş kalmayınca bunu söyler', async () => {
    api.get.mockResolvedValue({
      data: { available: true, summary: { total: 1, verified: 1, unknown: 0 }, items: [
        { location_id: 3, display_name: 'M1 Oda 103', block: 'M1', floor: 1, state: 'verified' },
      ] },
    })
    ciz()
    expect(await screen.findByText('Bu kapsamda yapılacak iş kalmadı')).toBeInTheDocument()
  })

  it('rapor okunamazsa gerekçeyi gösterir', async () => {
    api.get.mockResolvedValue({ data: { available: false, reason: 'Kurulum raporu okunamadı: no such table', items: [] } })
    ciz()
    expect(await screen.findByText(/Kurulum raporu okunamadı/)).toBeInTheDocument()
  })
})
