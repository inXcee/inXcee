import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import ProjectsPage from './ProjectsPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}))

const PROJELER = [
  { id: 1, name: 'FPU', code: 'FPU', staff_count: 72 },
  { id: 2, name: 'Kamp Alanı', code: 'KAMP', staff_count: 107 },
]
const FPU_KADRO = [{ id: 10, full_name: 'ARZU DOĞAN' }]
const KADROSUZ = [{ id: 99, full_name: 'KADROSUZ KİŞİ' }]

function mockGet() {
  api.get.mockImplementation(url => {
    if (url === '/projects') return Promise.resolve({ data: PROJELER })
    if (url.includes('project_id=none')) return Promise.resolve({ data: KADROSUZ })
    return Promise.resolve({ data: FPU_KADRO })
  })
}

describe('Projeler ekranı', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet()
    api.post.mockResolvedValue({ data: { ok: true } })
  })

  it('projeleri kadro sayısıyla listeler', async () => {
    renderWithProviders(<ProjectsPage />)
    expect(await screen.findByText('FPU')).toBeInTheDocument()
    expect(screen.getByText(/FPU · 72 kişi/)).toBeInTheDocument()
    expect(screen.getByText(/KAMP · 107 kişi/)).toBeInTheDocument()
  })

  it('kadrosu belirsiz olanları uyarı olarak gösterir', async () => {
    renderWithProviders(<ProjectsPage />)
    expect(await screen.findByText(/1 kişinin kadrosu belirlenmemiş/)).toBeInTheDocument()
  })

  it('proje seçilince kadro ve kadrosuz listeleri gelir', async () => {
    renderWithProviders(<ProjectsPage />)
    fireEvent.click(await screen.findByText('FPU'))
    expect(await screen.findByText('ARZU DOĞAN')).toBeInTheDocument()
    expect(screen.getByText('KADROSUZ KİŞİ')).toBeInTheDocument()
  })

  it('kadrodan çıkarma project_id null gönderir', async () => {
    renderWithProviders(<ProjectsPage />)
    fireEvent.click(await screen.findByText('FPU'))
    await screen.findByText('ARZU DOĞAN')
    fireEvent.click(screen.getByRole('button', { name: 'çıkar' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/projects/assign', { staff_ids: [10], project_id: null },
    ))
  })

  it('kadroya ekleme seçili projeye atar', async () => {
    renderWithProviders(<ProjectsPage />)
    fireEvent.click(await screen.findByText('FPU'))
    await screen.findByText('KADROSUZ KİŞİ')
    fireEvent.click(screen.getByRole('button', { name: 'ekle' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/projects/assign', { staff_ids: [99], project_id: 1 },
    ))
  })

  // Yanlış eşleşme riski yüzünden öneriler İŞARETSİZ gelmeli; kullanıcı
  // onaylamazsa o isim mevcut kayda bağlanmaz, yeni kişi olarak açılır.
  it('önizlemede öneriler işaretsiz gelir ve onaylanmayan yeni kişi olur', async () => {
    api.post.mockImplementation(url => {
      if (url.includes('/roster/preview')) {
        return Promise.resolve({ data: {
          exact: [{ name: 'ARZU DOĞAN', staff_id: 10, staff_name: 'ARZU DOĞAN' }],
          near: [{ name: 'ALİ RIZA ÇOLBAN', staff_id: 11, staff_name: 'ALİ RIZA ÇORBAN', score: 0.93 }],
          unknown: ['AYTAÇ ERTOP'],
        } })
      }
      return Promise.resolve({ data: { assigned: 1, created: 2 } })
    })

    renderWithProviders(<ProjectsPage />)
    fireEvent.click(await screen.findByText('FPU'))
    fireEvent.change(await screen.findByPlaceholderText(/ALİ RIZA ÇOLBAN/), {
      target: { value: 'ARZU DOĞAN\nALİ RIZA ÇOLBAN\nAYTAÇ ERTOP' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Eşleştirmeyi göster' }))

    expect(await screen.findByText(/1 kişi birebir eşleşti/)).toBeInTheDocument()
    const oneriKutusu = screen.getAllByRole('checkbox')[0]
    expect(oneriKutusu.checked).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Aktarımı uygula' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/projects/1/roster/apply',
      // Öneri onaylanmadı → mevcut kayda bağlanmaz, yeni isim olarak gider.
      { assign_staff_ids: [10], create_names: ['AYTAÇ ERTOP', 'ALİ RIZA ÇOLBAN'] },
    ))
  })

  it('öneri onaylanırsa mevcut kayda bağlanır', async () => {
    api.post.mockImplementation(url => {
      if (url.includes('/roster/preview')) {
        return Promise.resolve({ data: {
          exact: [],
          near: [{ name: 'ALİ RIZA ÇOLBAN', staff_id: 11, staff_name: 'ALİ RIZA ÇORBAN', score: 0.93 }],
          unknown: [],
        } })
      }
      return Promise.resolve({ data: { assigned: 1, created: 0 } })
    })

    renderWithProviders(<ProjectsPage />)
    fireEvent.click(await screen.findByText('FPU'))
    fireEvent.change(await screen.findByPlaceholderText(/ALİ RIZA ÇOLBAN/), {
      target: { value: 'ALİ RIZA ÇOLBAN' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Eşleştirmeyi göster' }))

    const kutu = await screen.findByRole('checkbox')
    fireEvent.click(kutu)
    fireEvent.click(screen.getByRole('button', { name: 'Aktarımı uygula' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/projects/1/roster/apply', { assign_staff_ids: [11], create_names: [] },
    ))
  })
})
