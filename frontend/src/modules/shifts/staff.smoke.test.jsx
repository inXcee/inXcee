import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import StaffTab from './tabs/StaffTab.jsx'
import StaffDetailPanel from './StaffDetailPanel.jsx'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'

const directoryStaff = [
  {
    id: 44,
    full_name: 'Ayşe Yılmaz',
    position: 'Vardiya Lideri',
    department_id: 2,
    dept_name: 'Operasyon',
    role_id: 3,
    role_name: 'Lider',
    primary_work_location_id: 5,
    primary_work_location_name: 'Ana Saha',
    gender: 'female',
    phone: '05550000000',
    email: 'ayse@example.com',
    is_active: 1,
    missing_documents: 2,
    expired_documents: 1,
    open_followups: 3,
    overdue_followups: 1,
    open_attendance_exceptions: 1,
    equipment_count: 2,
    active_inventory: 1,
    active_kkd: 1,
    risk_count: 4,
  },
  {
    id: 45,
    full_name: 'Mehmet Kaya',
    position: 'Teknik Uzman',
    department_id: 3,
    dept_name: 'Teknik',
    role_id: 4,
    role_name: 'Uzman',
    primary_work_location_id: 6,
    primary_work_location_name: 'Atölye',
    gender: 'male',
    phone: '',
    email: '',
    is_active: 1,
    today_shift_name: 'Sabah',
    today_status: 'scheduled',
    risk_count: 0,
  },
]

describe('shifts staff smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({ user: null, token: null })
    api.get.mockImplementation(url => {
      if (url === '/shifts/staff') return Promise.resolve({ data: directoryStaff })
      if (url === '/shifts/staff/quality') return Promise.resolve({ data: { summary: {}, rows: [] } })
      return Promise.resolve({ data: [] })
    })
  })

  it('StaffTab çökmeden render olur', () => {
    renderWithProviders(<StaffTab departments={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('TOPLAM PERSONEL')).toBeInTheDocument()
  })

  it('StaffDetailPanel çökmeden render olur (veri yok)', async () => {
    renderWithProviders(<StaffDetailPanel staffId={1} onClose={() => {}} />)
    expect(await screen.findByText('PERSONEL DOSYASI YÜKLENEMEDİ')).toBeInTheDocument()
  })

  it('personel dizini tablo, risk rozeti, seçim ve kart görünümünü destekler', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })

    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }]} onPersonClick={() => {}} />)

    expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument()
    expect(screen.getByText('1 süresi dolmuş belge')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Ayşe Yılmaz seç'))
    expect(screen.getByText('1 personel seçildi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kartlar' }))
    expect(screen.getAllByRole('button', { name: 'Personel Dosyası' })).toHaveLength(2)
  })

  it('özetler, hızlı odak, gelişmiş filtre ve yoğunluk kontrolleri etkileşimlidir', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'shift_supervisor' } })
    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }, { id: 3, name: 'Teknik' }]} onPersonClick={() => {}} />)

    expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'EKSİK BELGE: 2' }))
    expect(screen.queryByText('Mehmet Kaya')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'EKSİK BELGE: 2' }))

    fireEvent.click(screen.getByRole('button', { name: /Bugün vardiyada/ }))
    expect(screen.getByText('Mehmet Kaya')).toBeInTheDocument()
    expect(screen.queryByText('Ayşe Yılmaz')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Gelişmiş Filtreler/ }))
    expect(screen.getByLabelText('Cinsiyet filtresi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sıkı' }))
    expect(screen.getByRole('button', { name: 'Sıkı' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('bölüm gruplama ve tüm sonuçları seçme akışını destekler', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'shift_supervisor' } })
    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }, { id: 3, name: 'Teknik' }]} onPersonClick={() => {}} />)

    expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Bölüme göre grupla'))
    expect(screen.getByText('Operasyon', { selector: '.staff-directory-group-row span' })).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Ayşe Yılmaz seç'))
    fireEvent.click(screen.getByRole('button', { name: '2 Sonucun Tümünü Seç' }))
    expect(screen.getByText('2 personel seçildi')).toBeInTheDocument()
  })

  it('favori personelleri saklar ve hızlı favori filtresi uygular', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'shift_supervisor' } })
    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }, { id: 3, name: 'Teknik' }]} onPersonClick={() => {}} />)

    expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Ayşe Yılmaz favorilere ekle'))
    expect(screen.getByLabelText('Ayşe Yılmaz favorilerden çıkar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Favoriler/ }))
    expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument()
    expect(screen.queryByText('Mehmet Kaya')).not.toBeInTheDocument()
  })

  it('hazır görünüm, bölüm dağılımı ve personel karşılaştırmayı destekler', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'shift_supervisor' } })
    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }, { id: 3, name: 'Teknik' }]} onPersonClick={() => {}} />)

    expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument()
    const departmentButton = screen.getByRole('button', { name: /Operasyon 1/ })
    fireEvent.click(departmentButton)
    expect(departmentButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Hızlı Liste' }))
    expect(screen.getByRole('button', { name: 'Hızlı Liste' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(await screen.findByLabelText('Ayşe Yılmaz seç'))
    fireEvent.click(await screen.findByLabelText('Mehmet Kaya seç'))
    fireEvent.click(screen.getByRole('button', { name: '2 Kişiyi Karşılaştır' }))
    expect(screen.getByText('PERSONEL KARŞILAŞTIRMA')).toBeInTheDocument()
    expect(screen.getAllByText('Toplam risk').length).toBeGreaterThan(0)
  })
})
