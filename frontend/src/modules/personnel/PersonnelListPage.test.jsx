import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import PersonnelListPage from './PersonnelListPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

const PROJELER = [
  { id: 1, name: 'FPU', code: 'FPU', color_class: 'bg-blue-500', staff_count: 1 },
  { id: 2, name: 'Kamp Alanı', code: 'KAMP', color_class: 'bg-emerald-500', staff_count: 1 },
]
const PERSONEL = [
  { id: 10, full_name: 'ARZU DOĞAN', is_active: 1, project_id: 1, project_name: 'FPU', project_code: 'FPU', project_color: 'bg-blue-500', position: 'Saha Sorumlusu', dept_name: 'Operasyon', phone: '0532 111 22 33', tc_no: '123******01', primary_work_location_name: 'FPU Ana Saha' },
  { id: 11, full_name: 'AKIN AKTAŞ', is_active: 1, project_id: 2, project_name: 'Kamp Alanı', project_code: 'KAMP', project_color: 'bg-emerald-500' },
  { id: 12, full_name: 'KADROSUZ KİŞİ', is_active: 1, project_id: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(url => {
    if (url === '/projects') return Promise.resolve({ data: PROJELER })
    if (url === '/shifts/staff') return Promise.resolve({ data: PERSONEL })
    return Promise.resolve({ data: [] })
  })
  api.post.mockResolvedValue({ data: { updated: 1 } })
})

describe('Personel listesi — kadro', () => {
  it('her kartta kadro rozeti görünür, kadrosuz olan açıkça işaretlenir', async () => {
    renderWithProviders(<PersonnelListPage />)
    expect(await screen.findByText('ARZU DOĞAN')).toBeInTheDocument()
    expect(screen.getByText('FPU')).toBeInTheDocument()
    expect(screen.getByText('KAMP')).toBeInTheDocument()
    expect(screen.getByText('KADROSUZ')).toBeInTheDocument()
  })

  it('kart temel çalışma ve iletişim bilgilerini pratik biçimde sunar', async () => {
    renderWithProviders(<PersonnelListPage />)
    expect(await screen.findByText('ARZU DOĞAN')).toBeInTheDocument()
    expect(screen.getByText('Saha Sorumlusu')).toBeInTheDocument()
    expect(screen.getByText('Operasyon')).toBeInTheDocument()
    expect(screen.getByText('FPU Ana Saha')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '0532 111 22 33' })).toHaveAttribute('href', 'tel:0532 111 22 33')
    expect(screen.getByText('123******01')).toBeInTheDocument()
  })

  it('proje filtresi listeyi süzer', async () => {
    renderWithProviders(<PersonnelListPage />)
    await screen.findByText('ARZU DOĞAN')
    fireEvent.change(screen.getByLabelText('Proje filtresi'), { target: { value: '2' } })
    expect(screen.queryByText('ARZU DOĞAN')).not.toBeInTheDocument()
    expect(screen.getByText('AKIN AKTAŞ')).toBeInTheDocument()
  })

  it('kadrosu belirsiz olanlar ayrıca süzülebilir', async () => {
    renderWithProviders(<PersonnelListPage />)
    await screen.findByText('ARZU DOĞAN')
    fireEvent.change(screen.getByLabelText('Proje filtresi'), { target: { value: 'none' } })
    expect(screen.getByText('KADROSUZ KİŞİ')).toBeInTheDocument()
    expect(screen.queryByText('AKIN AKTAŞ')).not.toBeInTheDocument()
  })

  // Kullanıcının bulamadığı şey buydu: kimi hangi projeye ekleyeceği.
  it('seçilenler toplu olarak proje kadrosuna alınır', async () => {
    renderWithProviders(<PersonnelListPage />)
    await screen.findByText('KADROSUZ KİŞİ')
    fireEvent.click(screen.getByRole('button', { name: /Kadro ata/ }))
    fireEvent.click(screen.getByText('KADROSUZ KİŞİ'))
    fireEvent.click(screen.getByRole('button', { name: 'Kamp Alanı' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/projects/assign', { staff_ids: [12], project_id: 2 },
    ))
  })

  it('kadrodan çıkarma project_id null gönderir', async () => {
    renderWithProviders(<PersonnelListPage />)
    await screen.findByText('ARZU DOĞAN')
    fireEvent.click(screen.getByRole('button', { name: /Kadro ata/ }))
    fireEvent.click(screen.getByText('ARZU DOĞAN'))
    fireEvent.click(screen.getByRole('button', { name: 'Kadrodan çıkar' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/projects/assign', { staff_ids: [10], project_id: null },
    ))
  })

  // Seçim modunda karta tıklamak 360° görünüme GİTMEMELİ; yoksa toplu atama
  // yapmaya çalışan kullanıcı her tıklamada sayfadan çıkar.
  it('seçim modunda kart tıklaması kişiyi seçer, sayfadan çıkmaz', async () => {
    renderWithProviders(<PersonnelListPage />)
    await screen.findByText('ARZU DOĞAN')
    fireEvent.click(screen.getByRole('button', { name: /Kadro ata/ }))
    fireEvent.click(screen.getByText('ARZU DOĞAN'))
    expect(screen.getByLabelText('ARZU DOĞAN seç').checked).toBe(true)
    expect(screen.getByText('1 kişi seçili')).toBeInTheDocument()
  })

  it('kadrosu belirsiz uyarısı sayıyı verir ve doğrudan atamaya götürür', async () => {
    renderWithProviders(<PersonnelListPage />)
    expect(await screen.findByText(/1 kişinin/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bunları göster ve kadroya al/ }))
    expect(screen.getByText('KADROSUZ KİŞİ')).toBeInTheDocument()
    expect(screen.queryByText('ARZU DOĞAN')).not.toBeInTheDocument()
  })
})
