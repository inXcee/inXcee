import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import BurstBagCenterView from './BurstBagCenterView.jsx'

vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}))

const centerData = {
  summary: { open_incidents: 1, sorting: 0, ready_for_selection: 1, waiting_pieces: 1, returned_pieces: 1, unresolved_pieces: 0 },
  incidents: [{
    id: 7, source_block: 'F2A', source_room_no: '80', source_file_no: '2', source_person_name: 'Ali Demir',
    burst_stage: 'washing', found_location: 'Ayırma Masası 2', notes: 'File yıkama çıkışında patladı',
    status: 'ready_for_selection', reported_by: 'Ayşe Yılmaz', created_at: '2026-08-02 08:00:00',
    piece_total: 2, piece_waiting: 1, piece_returned: 1, piece_unresolved: 0,
    pieces: [
      { id: 71, temporary_code: 'AYR-7-01', garment_type: 'Gömlek', color: 'Lacivert', brand: 'Mavi', size: 'L', distinguishing_note: 'Sol manşette isim etiketi', status: 'waiting' },
      { id: 72, temporary_code: 'AYR-7-02', garment_type: 'Pantolon', color: 'Siyah', size: '32', status: 'returned', claimed_by_name: 'Ali Demir', claimed_block: 'F2A', claimed_room_no: '80', claimed_at: '2026-08-02 10:00:00', claim_note: 'Marka ve bedenle doğrulandı' },
    ],
  }],
}

function setup() {
  const kioskApi = {
    get: vi.fn(url => Promise.resolve({ data: url.endsWith('/garment-types')
      ? [{ id: 1, name: 'Gömlek', emoji: '👔' }, { id: 2, name: 'Pantolon', emoji: '👖' }]
      : centerData })),
    post: vi.fn((url) => Promise.resolve({ data: url.endsWith('/burst-bags') ? { id: 9 } : { ok: true } })),
    put: vi.fn(() => Promise.resolve({ data: { ok: true } })),
  }
  renderWithProviders(<BurstBagCenterView kioskApi={kioskApi} />)
  return kioskApi
}

describe('Patlayan file Ayırma Merkezi', () => {
  it('ayrılan kıyafetleri ayırt edici bilgileri ve teslim geçmişiyle gösterir', async () => {
    setup()
    await waitFor(() => expect(screen.getByRole('button', { name: /ODA FİLESİ · 2/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /ODA FİLESİ · 2/ }))
    expect(screen.getByText('AYR-7-01')).toBeInTheDocument()
    expect(screen.getByText(/Gömlek · Lacivert · Mavi · L beden/)).toBeInTheDocument()
    expect(screen.getByText('Sol manşette isim etiketi')).toBeInTheDocument()
    expect(screen.getAllByText('Ali Demir').length).toBeGreaterThan(0)
    // Teslim satırı blok kodunu değil, kartın geri kalanıyla aynı görünen adı kullanır;
    // teslim saatiyle birlikte arayarak olay başlığındaki oda satırından ayırıyoruz.
    expect(screen.getByText(/Faz 2 A-80 · 02 Ağu 2026/)).toBeInTheDocument()
  })

  it('yeni patlayan file olayını oda, file, kişi ve işaretlenen kıyafetlerle açar', async () => {
    const kioskApi = setup()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ayırma Merkezi' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '＋ Patlayan file kaydı' }))
    fireEvent.change(screen.getByLabelText('File bloğu'), { target: { value: 'F2A' } })
    fireEvent.change(screen.getByPlaceholderText('Örn. 80'), { target: { value: '80' } })
    fireEvent.change(screen.getByPlaceholderText('Örn. 2'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('Ad soyad'), { target: { value: 'Ali Demir' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Gömlek/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gömlek artır' }))
    fireEvent.change(screen.getByPlaceholderText(/File nerede patladı/), { target: { value: 'Taşıma sırasında yırtıldı' } })
    fireEvent.click(screen.getByRole('button', { name: /Oda filesini kaydet/ }))
    await waitFor(() => expect(kioskApi.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/burst-bags',
      expect.objectContaining({
        block: 'F2A', room_no: '80', file_no: '2', person_name: 'Ali Demir',
        garments: [{ type_id: 1, type_name: 'Gömlek', count: 2 }],
        notes: 'Taşıma sırasında yırtıldı',
      }),
    ))
  })

  it('seçilen kıyafeti ad, blok, oda ve doğrulama notuyla sahibine verir', async () => {
    const kioskApi = setup()
    await waitFor(() => expect(screen.getByRole('button', { name: /ODA FİLESİ · 2/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /ODA FİLESİ · 2/ }))
    fireEvent.click(screen.getByRole('button', { name: '✓ Teslim et' }))
    expect(screen.getByPlaceholderText('Teslim alan ad soyad')).toHaveValue('Ali Demir')
    fireEvent.change(screen.getByPlaceholderText(/Nasıl doğrulandı/), { target: { value: 'İsim etiketi eşleşti' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sahibine teslim edildi' }))
    await waitFor(() => expect(kioskApi.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/burst-bags/7/pieces/71/claim',
      { claimed_by_name: 'Ali Demir', block: 'F2A', room_no: '80', claim_note: 'İsim etiketi eşleşti' },
    ))
  })
})
