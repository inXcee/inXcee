import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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
    primary_work_location_site: 'Filyos',
    project_id: 8,
    project_name: 'FPU',
    project_code: 'FPU',
    project_color: 'bg-blue-500',
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
    project_id: 9,
    project_name: 'Kamp Alanı',
    project_code: 'KAMP',
    project_color: 'bg-emerald-500',
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
    window.history.replaceState({}, '', '/shifts?tab=staff')
    useAuthStore.setState({ user: null, token: null })
    api.get.mockImplementation(url => {
      if (url === '/shifts/staff') return Promise.resolve({ data: directoryStaff })
      if (url === '/shifts/staff/quality') return Promise.resolve({ data: { summary: {}, rows: [] } })
      if (url === '/projects') return Promise.resolve({ data: [
        { id: 8, name: 'FPU', code: 'FPU', staff_count: 1 },
        { id: 9, name: 'Kamp Alanı', code: 'KAMP', staff_count: 1 },
      ] })
      if (url === '/personnel/tracking/overview') return Promise.resolve({ data: {
        kpis: { active: 2, offboarding: 1, exited: 0, hired: 1, permanent_movements: 2, temporary_project_work: 1, shift_changes: 3, annual_leave_days: 2, sick_leave_days: 1, other_leave_days: 0, overtime_hours: 12, absent_days: 1, open_alerts: 1, overdue_alerts: 0, critical_alerts: 1 },
        trends: [{ month: '2026-08', shift_changes: 3, movements: 2, exits: 0 }],
      } })
      if (url === '/personnel/tracking/people') return Promise.resolve({ data: { total: 1, items: [{ id: 44, full_name: 'Ayşe Yılmaz', employment_status: 'active', project_name: 'FPU', department_name: 'Operasyon', last_event_type: 'assignment_changed', last_event_at: '2026-08-01 10:00:00', annual_leave_days: 2, sick_leave_days: 1, sick_occurrences: 1, overtime_hours: 12, absent_days: 1, shift_changes: 3, permanent_movements: 2, open_alerts: 1 }] } })
      if (url === '/personnel/tracking/events') return Promise.resolve({ data: { total: 1, items: [{ id: 501, staff_id: 44, full_name: 'Ayşe Yılmaz', event_type: 'assignment_changed', effective_at: '2026-08-01 10:00:00', before: { project: 'Eski' }, after: { project: 'FPU' }, reason: 'Proje transferi', actor_name: 'Müdür' }] } })
      if (url === '/personnel/tracking/alerts') return Promise.resolve({ data: { items: [{ id: 61, staff_id: 44, full_name: 'Ayşe Yılmaz', severity: 'critical', status: 'open', title: 'Yüksek mesai', message: 'Aylık mesai eşiği yaklaşıyor', due_at: '2026-08-10' }] } })
      if (url === '/personnel/tracking/settings') return Promise.resolve({ data: { rules: [] } })
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
    expect(screen.getAllByText('FPU').length).toBeGreaterThan(0)
    expect(screen.getByText(/FPU \/ Operasyon \/ Filyos \/ Ana Saha/)).toBeInTheDocument()
  })

  it('filtrelenebilir personel takip merkezini ve hareket akışını açar', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }]} onPersonClick={() => {}} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Takip Merkezi' }))
    expect(await screen.findByText('Personel karşılaştırması')).toBeInTheDocument()
    expect(await screen.findByText('Kalıcı transfer')).toBeInTheDocument()
    expect(await screen.findByText('Kim değişti?')).toBeInTheDocument()
    expect(await screen.findByText('Aylık mesai eşiği yaklaşıyor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tam Dosya' })).toHaveAttribute('href', '/shifts/personnel/44?tab=work')
    expect(screen.getByRole('tab', { name: 'Takip Merkezi' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.change(screen.getByLabelText('Takip merkezi departman filtresi'), { target: { value: '2' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/personnel/tracking/people', expect.objectContaining({ params: expect.objectContaining({ department_id: '2' }) })))
  })

  it('hızlı personel dosyasında tamamlanma, organizasyon yolu ve pratik düzenleme sunar', async () => {
    api.get.mockImplementation(url => {
      if (url === '/personnel/44/dossier') return Promise.resolve({ data: {
        person: { ...directoryStaff[0], tc_no: '111******11', birth_date: '', emergency_contact: '', emergency_phone: '' },
        access: { can_manage_followups: true },
        documents: { completion_rate: 75, missing: 2, expired: 0 },
        counters: {}, data_quality: { missing_fields: ['birth_date', 'emergency_phone'] }, risks: [],
      } })
      if (url === '/shifts/roles') return Promise.resolve({ data: [{ id: 3, name: 'Lider' }] })
      if (url === '/shifts/work-locations') return Promise.resolve({ data: [{ id: 5, name: 'Ana Saha', site: 'Filyos' }] })
      if (url === '/projects') return Promise.resolve({ data: [{ id: 8, name: 'FPU' }] })
      return Promise.resolve({ data: [] })
    })

    renderWithProviders(<StaffDetailPanel staffId={44} onClose={() => {}} departments={[{ id: 2, name: 'Operasyon' }]} />)

    expect(await screen.findByText('DOSYA HAZIRLIK DURUMU')).toBeInTheDocument()
    expect(screen.getByText(/FPU \/ Operasyon \/ Filyos \/ Ana Saha/)).toBeInTheDocument()
    expect(screen.getByLabelText('Hızlı personel işlemleri')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Eksikleri tamamla' }))
    expect(await screen.findByText('PROJE VE GÖREV ATAMASI')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Filyos / Ana Saha' })).toBeInTheDocument()
  })

  it('proje ve departman filtrelerini API sorgusuna birlikte gönderir', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'shift_supervisor' } })
    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }]} onPersonClick={() => {}} />)

    await screen.findByText('Ayşe Yılmaz')
    fireEvent.change(screen.getByLabelText('Proje filtresi'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Departman filtresi'), { target: { value: '2' } })

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/shifts/staff', expect.objectContaining({
      params: expect.objectContaining({ project_id: '8', dept_id: '2', directory: 1 }),
    })))
    expect(screen.getByRole('button', { name: 'Detaylı Excel' })).toBeInTheDocument()
  })

  it('seçili personelin projesini toplu olarak değiştirebilir', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'shift_supervisor' } })
    renderWithProviders(<StaffTab departments={[{ id: 2, name: 'Operasyon' }]} onPersonClick={() => {}} />)

    await screen.findByText('Ayşe Yılmaz')
    fireEvent.click(screen.getByLabelText('Ayşe Yılmaz seç'))
    fireEvent.click(screen.getByRole('button', { name: 'Proje / Departman / Lokasyon Ata' }))
    fireEvent.change(screen.getByLabelText('Toplu proje ataması'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '1 Personele Uygula' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/shifts/staff/bulk/assignment',
      expect.objectContaining({ staff_ids: [44], project_id: 9 }),
    ))
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
